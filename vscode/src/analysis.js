// Lightweight source analysis for completion, hover, signature help,
// navigation and the outline. It works on raw text with regular expressions
// and a small scanner, so it stays fast and tolerates code that does not
// parse yet, which is most code while it is being typed.

const api = require('../data/api.json');

const KEYWORDS = [
  'and', 'break', 'const', 'continue', 'do', 'else', 'elseif', 'end', 'false', 'for',
  'function', 'global', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
  'then', 'true', 'until', 'while',
];

const IDENT = '[A-Za-z_][A-Za-z0-9_]*';

/** Entries by full name (`math.floor`, `print`, `Window:clear`). */
const byName = new Map(api.entries.map((e) => [e.name, e]));

/** Library pages by the name scripts reach them through. */
const libraries = new Map();
for (const lib of api.libraries) {
  if (lib.module) libraries.set(lib.module, lib);
}

/** The namespace a `require` argument loads: `@neyuki/fs` -> `fs`. */
function namespaceForModule(module) {
  if (module.startsWith('@neyuki/')) {
    const root = module.slice('@neyuki/'.length);
    return libraries.has(module) || libraries.has(root) ? root : null;
  }
  return libraries.has(module) ? module : null;
}

const STANDARD_NAMESPACES = api.libraries.filter((l) => l.module && !l.module.startsWith('@')).map((l) => l.module);

/** Every namespace that has members: `math`, `fs`, `hid.keyboard`, ... */
const namespaces = new Set();
for (const entry of api.entries) {
  const parts = entry.name.split(':')[0].split('.');
  for (let i = 1; i < parts.length; i++) namespaces.add(parts.slice(0, i).join('.'));
}

/** Object types with methods (`Window`, `Connection`) and their methods. */
const typeMethods = new Map();
for (const entry of api.entries) {
  if (entry.kind !== 'method') continue;
  if (!typeMethods.has(entry.owner)) typeMethods.set(entry.owner, []);
  typeMethods.get(entry.owner).push(entry);
}

/** Replaces string and comment contents with spaces, keeping offsets. */
function maskText(text) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < text.length) {
    const rest = text.slice(i);
    let m;
    if ((m = rest.match(/^--\[(=*)\[/))) {
      const close = text.indexOf(`]${m[1]}]`, i + m[0].length);
      const end = close === -1 ? text.length : close + m[1].length + 2;
      out += blank(text.slice(i, end));
      i = end;
    } else if (rest.startsWith('--') && !/[\w)\]]$/.test(out)) {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if ((m = rest.match(/^\[(=*)\[/))) {
      const close = text.indexOf(`]${m[1]}]`, i + m[0].length);
      const end = close === -1 ? text.length : close + m[1].length + 2;
      out += close === -1 ? text[i] + blank(text.slice(i + 1, end)) : text[i] + blank(text.slice(i + 1, end - 1)) + ']';
      i = end;
    } else if (text[i] === '`') {
      // Interpolated expressions stay visible; only the literal text is blanked.
      out += '`';
      let j = i + 1;
      while (j < text.length && text[j] !== '`') {
        if (text[j] === '\\') {
          out += blank(text.slice(j, j + 2));
          j += 2;
        } else if (text[j] === '{') {
          let depth = 0;
          let k = j;
          for (; k < text.length; k++) {
            if (text[k] === '{') depth++;
            else if (text[k] === '}' && --depth === 0) break;
          }
          out += maskText(text.slice(j, Math.min(k + 1, text.length)));
          j = k + 1;
        } else {
          out += blank(text[j]);
          j++;
        }
      }
      if (j < text.length) out += '`';
      i = j + 1;
    } else if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length && text[j] !== quote && !(quote !== '`' && text[j] === '\n')) {
        if (text[j] === '\\') j++;
        j++;
      }
      const closed = j < text.length && text[j] === quote;
      out += quote + blank(text.slice(i + 1, j)) + (closed ? quote : '');
      i = closed ? j + 1 : j;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** The base type name of a type annotation: `Window?` -> `Window`. */
function baseType(type) {
  if (!type) return undefined;
  const m = type.trim().match(/^\(?\s*([A-Za-z_]\w*)/);
  return m ? m[1] : undefined;
}

/**
 * What the names declared in `text` stand for: a namespace (from
 * `require`), an object type (from an annotation or a known call), or
 * `string` for string literals.
 */
function bindings(text) {
  const masked = maskText(text);
  const result = new Map();
  // Standard libraries are globals.
  for (const ns of STANDARD_NAMESPACES) result.set(ns, { namespace: ns });

  const requireRe = new RegExp(`\\b(?:local|const|global)?\\s*(${IDENT})\\s*=\\s*require\\s*\\(?\\s*["']([^"']+)["']`, 'g');
  let m;
  while ((m = requireRe.exec(text)) !== null) {
    const ns = namespaceForModule(m[2]);
    if (ns) result.set(m[1], { namespace: ns });
  }

  const annotated = new RegExp(`\\b(?:local|const|global)\\s+(${IDENT})\\s*:\\s*([A-Za-z_][\\w.]*)`, 'g');
  while ((m = annotated.exec(masked)) !== null) {
    if (!result.has(m[1])) result.set(m[1], { type: m[2] });
  }

  const assigned = new RegExp(`\\b(?:local|const|global)\\s+(${IDENT})\\s*=\\s*([A-Za-z_][\\w.:]*)\\s*\\(`, 'g');
  while ((m = assigned.exec(masked)) !== null) {
    if (result.has(m[1])) continue;
    const entry = resolveEntry(m[2], result);
    const type = entry && baseType(entry.returns);
    if (type && type !== 'any' && type !== 'table') result.set(m[1], { type });
  }

  const literal = new RegExp(`\\b(?:local|const|global)\\s+(${IDENT})\\s*=\\s*["'\`\\[]`, 'g');
  while ((m = literal.exec(masked)) !== null) {
    if (!result.has(m[1])) result.set(m[1], { type: 'string' });
  }
  return result;
}

/** Rewrites the first name of `chain` through the bindings: `f.read` -> `fs.read`. */
function canonical(chain, binds) {
  const m = chain.match(/^([A-Za-z_]\w*)(.*)$/);
  if (!m) return chain;
  const bound = binds.get(m[1]);
  if (bound && bound.namespace) return bound.namespace + m[2];
  if (bound && bound.type) return bound.type + m[2];
  return chain;
}

/** The API entry a written expression such as `f.read` or `win:clear` names. */
function resolveEntry(chain, binds) {
  const name = canonical(chain, binds);
  if (byName.has(name)) return byName.get(name);
  // `obj:method` on a typed binding, written as `Type:method`.
  return undefined;
}

/** Members of a namespace: functions, values and nested namespaces. */
function namespaceMembers(ns) {
  const prefix = ns + '.';
  const members = [];
  const nested = new Set();
  for (const entry of api.entries) {
    if (!entry.name.startsWith(prefix) || entry.kind === 'method') continue;
    const rest = entry.name.slice(prefix.length);
    if (!rest.includes('.')) members.push(entry);
    else nested.add(rest.split('.')[0]);
  }
  for (const name of nested) {
    if (!members.some((e) => e.name === prefix + name)) {
      members.push({ name: prefix + name, kind: 'namespace', doc: '', signature: prefix + name });
    }
  }
  return members;
}

/** Methods available after `receiver:` given what the receiver is bound to. */
function methodsFor(receiver, binds) {
  const bound = binds.get(receiver);
  const type = bound && bound.type;
  if (type && typeMethods.has(type)) return typeMethods.get(type);
  if (type === 'string' || !bound) {
    // Strings carry the string library as methods; for an unknown receiver
    // it is the likeliest guess.
    return namespaceMembers('string').filter((e) => e.kind === 'function');
  }
  return [];
}

/**
 * Declarations in `text`: locals, globals, functions, parameters and loop
 * variables, with the offset each is declared at.
 */
function declarations(text) {
  const masked = maskText(text);
  const found = [];
  const add = (name, kind, offset, detail) => {
    if (!KEYWORDS.includes(name)) found.push({ name, kind, offset, detail });
  };
  let m;

  const fn = new RegExp(`\\b(local\\s+|const\\s+|global\\s+)?function\\s+((?:${IDENT}\\s*\\.\\s*)*(?:${IDENT}\\s*:\\s*)?${IDENT})\\s*\\(([^)]*)\\)([^\\n]*)`, 'g');
  while ((m = fn.exec(masked)) !== null) {
    const name = m[2].replace(/\s+/g, '');
    const nameOffset = m.index + m[0].indexOf(m[2]);
    const returns = (m[4].match(/^\s*:\s*([^=\n]*?)(?=\s+(?:[A-Za-z_]|$)|$)/) ?? [])[1];
    add(name, 'function', nameOffset, `function ${name}(${m[3].trim()})${returns ? ': ' + returns.trim() : ''}`);
    const paramsOffset = m.index + m[0].indexOf('(') + 1;
    for (const p of m[3].matchAll(new RegExp(`(${IDENT}|\\.\\.\\.)\\s*(?::\\s*([^,]+))?`, 'g'))) {
      if (p[1] === '...') continue;
      add(p[1], 'parameter', paramsOffset + p.index, `(parameter) ${p[1]}${p[2] ? ': ' + p[2].trim() : ''}`);
    }
    if (name.includes(':')) add('self', 'parameter', nameOffset, `(parameter) self: ${name.split(':')[0]}`);
  }

  const anon = /\bfunction\s*\(([^)]*)\)/g;
  while ((m = anon.exec(masked)) !== null) {
    const paramsOffset = m.index + m[0].indexOf('(') + 1;
    for (const p of m[1].matchAll(new RegExp(`(${IDENT})\\s*(?::\\s*([^,]+))?`, 'g'))) {
      add(p[1], 'parameter', paramsOffset + p.index, `(parameter) ${p[1]}${p[2] ? ': ' + p[2].trim() : ''}`);
    }
  }

  const local = new RegExp(`\\b(local|const|global)\\s+(?!function\\b)((?:${IDENT}\\s*(?::\\s*[^,=\\n]+?)?\\s*,\\s*)*${IDENT}(?:\\s*:\\s*[^=\\n]+?)?)\\s*(=|\\n|$)`, 'gm');
  while ((m = local.exec(masked)) !== null) {
    const start = m.index + m[0].indexOf(m[2]);
    for (const part of m[2].matchAll(new RegExp(`(${IDENT})\\s*(?::\\s*([^,]+))?`, 'g'))) {
      const type = part[2] && part[2].trim();
      add(part[1], m[1] === 'const' ? 'constant' : 'variable', start + part.index, `${m[1]} ${part[1]}${type ? ': ' + type : ''}`);
    }
  }

  const loop = new RegExp(`\\bfor\\s+((?:${IDENT}\\s*,\\s*)*${IDENT})\\s*(?:=|\\bin\\b)`, 'g');
  while ((m = loop.exec(masked)) !== null) {
    const start = m.index + m[0].indexOf(m[1]);
    for (const part of m[1].matchAll(new RegExp(IDENT, 'g'))) {
      add(part[0], 'variable', start + part.index, `(loop variable) ${part[0]}`);
    }
  }

  return found.sort((a, b) => a.offset - b.offset);
}

/** The declaration of `name` that is in effect at `offset`: the last one before it. */
function definitionOf(text, name, offset) {
  const candidates = declarations(text).filter((d) => d.name === name);
  const before = candidates.filter((d) => d.offset <= offset);
  return before[before.length - 1] ?? candidates[0];
}

/**
 * What completion should offer at the end of `before` (the text up to the
 * cursor): `{ kind: 'member', chain, prefix }` after `a.b.`, `{ kind:
 * 'method', receiver, prefix }` after `x:`, `{ kind: 'module', prefix }`
 * inside `require("`, or `{ kind: 'global', prefix }`.
 */
function completionContext(before) {
  let m;
  if ((m = before.match(/\brequire\s*\(?\s*["']([@\w/]*)$/))) return { kind: 'module', prefix: m[1] };
  // Inside a string or a comment (but not an interpolated expression),
  // masking blanks out the text before the cursor.
  const masked = maskText(before);
  const tail = before.slice(before.lastIndexOf('\n') + 1);
  if (/\S$/.test(tail) && !/\S$/.test(masked)) return { kind: 'none', prefix: '' };
  if ((m = before.match(new RegExp(`((?:${IDENT}\\s*\\.\\s*)*${IDENT})\\s*\\.\\s*(${IDENT})?$`)))) {
    if (!before.slice(0, m.index).endsWith('.')) {
      return { kind: 'member', chain: m[1].replace(/\s+/g, ''), prefix: m[2] ?? '' };
    }
  }
  if ((m = before.match(new RegExp(`(${IDENT}|\\)|["'\`\\]])\\s*:\\s*(${IDENT})?$`)))) {
    // A colon after a name could also start a type annotation.
    const line = before.slice(before.lastIndexOf('\n') + 1);
    const isDeclaration = /^\s*(local|const|global)\s/.test(line);
    const inParameters = /\bfunction\b[^)]*$/.test(line);
    const isReturnType = /\bfunction\b[^(]*\([^)]*\)\s*:\s*\w*$/.test(line);
    if (!isDeclaration && !inParameters && !isReturnType) {
      return { kind: 'method', receiver: /\w/.test(m[1]) ? m[1] : 'string', prefix: m[2] ?? '' };
    }
    return { kind: 'type', prefix: m[2] ?? '' };
  }
  m = before.match(new RegExp(`(${IDENT})?$`));
  return { kind: 'global', prefix: m[1] ?? '' };
}

/**
 * The call the cursor is inside, as `{ callee, activeParameter }`, or null.
 * `before` is the text up to the cursor.
 */
function callContext(before) {
  const masked = maskText(before);
  let depth = 0;
  let commas = 0;
  for (let i = masked.length - 1; i >= 0; i--) {
    const c = masked[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') {
      if (depth === 0) {
        if (c !== '(') return null;
        const head = masked.slice(0, i).match(new RegExp(`((?:${IDENT}\\s*[.:]\\s*)*${IDENT})\\s*$`));
        if (!head) return null;
        const callee = head[1].replace(/\s+/g, '');
        if (KEYWORDS.includes(callee)) return null;
        return { callee, activeParameter: commas };
      }
      depth--;
    } else if (c === ',' && depth === 0) commas++;
    else if (c === '\n' && /^\s*(local|function|if|for|while|return)\b/.test(masked.slice(i + 1)) && depth === 0) {
      // A new statement started; the cursor is not inside a call.
      if (i < masked.length - 1 && !/^\s*$/.test(masked.slice(i + 1))) return null;
    }
  }
  return null;
}

/**
 * The entry for a call or hover target written as `chain`, looking through
 * bindings and, for `x:method`, the receiver's type.
 */
function entryForChain(chain, binds) {
  const direct = resolveEntry(chain, binds);
  if (direct) return direct;
  const colon = chain.lastIndexOf(':');
  if (colon !== -1) {
    const receiver = chain.slice(0, colon);
    const method = chain.slice(colon + 1);
    const candidates = methodsFor(receiver.split('.').pop(), binds);
    const found = candidates.find((e) => e.name.endsWith(':' + method) || e.name.endsWith('.' + method));
    if (found) return found;
  }
  return undefined;
}

/** A function entry's parameters, dropping the receiver for method-style calls on strings. */
function callParameters(entry, chain) {
  const params = entry.params ?? [];
  if (chain.includes(':') && entry.kind === 'function' && entry.name.startsWith('string.')) {
    return params.slice(1);
  }
  return params;
}

/**
 * Top-level structure for the outline: functions (with their methods
 * grouped under the table they belong to) and top-level variables.
 */
function outline(text) {
  return declarations(text).filter((d) => {
    if (d.kind === 'parameter' || d.detail.startsWith('(loop')) return false;
    if (d.kind === 'function') return true;
    const lineStart = text.lastIndexOf('\n', d.offset) + 1;
    return !/^\s/.test(text.slice(lineStart, d.offset));
  });
}

module.exports = {
  api,
  KEYWORDS,
  STANDARD_NAMESPACES,
  byName,
  namespaces,
  typeMethods,
  maskText,
  bindings,
  canonical,
  namespaceMembers,
  methodsFor,
  declarations,
  definitionOf,
  completionContext,
  callContext,
  entryForChain,
  callParameters,
  outline,
  namespaceForModule,
};

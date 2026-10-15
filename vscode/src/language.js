// Completion, hover, signature help, go to definition and the outline,
// driven by the library reference data and the analysis in analysis.js.

const vscode = require('vscode');
const a = require('./analysis');

const SELECTOR = { language: 'neyuki' };
const REFERENCE_URL = 'https://neyuki.cc/docs/reference/';

const KIND = {
  function: vscode.CompletionItemKind.Function,
  method: vscode.CompletionItemKind.Method,
  value: vscode.CompletionItemKind.Constant,
  namespace: vscode.CompletionItemKind.Module,
  variable: vscode.CompletionItemKind.Variable,
  constant: vscode.CompletionItemKind.Constant,
  parameter: vscode.CompletionItemKind.Variable,
};

const TYPES = ['any', 'nil', 'boolean', 'number', 'int', 'float', 'string', 'table', 'function', 'buffer', 'thread'];

/** Markdown documentation for an API entry. */
function entryDocs(entry) {
  const md = new vscode.MarkdownString();
  if (entry.kind !== 'namespace') md.appendCodeblock(entry.signature, 'neyuki');
  if (entry.doc) md.appendMarkdown('\n' + entry.doc.replace(/```lua/g, '```neyuki'));
  if (entry.page) md.appendMarkdown(`\n\n[Reference](${REFERENCE_URL}${entry.page})`);
  return md;
}

/** The last part of an entry name: `math.floor` -> `floor`, `Window:clear` -> `clear`. */
function shortName(name) {
  return name.split(/[.:]/).pop();
}

function insertParens() {
  return vscode.workspace.getConfiguration('neyuki').get('completion.insertParentheses', true);
}

function entryItem(entry, range) {
  const label = shortName(entry.name);
  const item = new vscode.CompletionItem(
    { label, detail: entry.params ? `(${entry.params.map((p) => p.label).join(', ')})` : undefined, description: entry.returns && entry.returns !== '()' ? entry.returns : undefined },
    KIND[entry.kind] ?? vscode.CompletionItemKind.Field
  );
  item.documentation = entryDocs(entry);
  item.range = range;
  if ((entry.kind === 'function' || entry.kind === 'method') && insertParens()) {
    item.insertText = new vscode.SnippetString(entry.params && entry.params.length ? `${label}($0)` : `${label}()$0`);
    item.command = { command: 'editor.action.triggerParameterHints', title: 'Parameter hints' };
  }
  return item;
}

function provideCompletion(document, position) {
  const before = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const context = a.completionContext(before);
  if (context.kind === 'none') return undefined;
  const range = document.getWordRangeAtPosition(position, /[@\w/]+/) ?? new vscode.Range(position, position);
  const text = document.getText();
  const binds = a.bindings(text);
  const items = [];

  if (context.kind === 'module') {
    for (const lib of a.api.libraries) {
      if (!lib.module) continue;
      const item = new vscode.CompletionItem(lib.module, vscode.CompletionItemKind.Module);
      item.documentation = new vscode.MarkdownString(lib.doc);
      item.range = document.getWordRangeAtPosition(position, /[@\w/]+/);
      items.push(item);
    }
    return items;
  }

  if (context.kind === 'member') {
    const ns = a.canonical(context.chain, binds);
    for (const entry of a.namespaceMembers(ns)) items.push(entryItem(entry, range));
    return items;
  }

  if (context.kind === 'method') {
    for (const entry of a.methodsFor(context.receiver, binds)) {
      // String functions called as methods take the string as the receiver.
      const shown = entry.name.startsWith('string.') ? { ...entry, params: (entry.params ?? []).slice(1) } : entry;
      items.push(entryItem(shown, range));
    }
    return items;
  }

  if (context.kind === 'type') {
    for (const type of TYPES) items.push(new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter));
    for (const type of a.typeMethods.keys()) items.push(new vscode.CompletionItem(type, vscode.CompletionItemKind.Class));
    return items;
  }

  // Names visible anywhere: locals, globals, libraries and keywords.
  const seen = new Set();
  const offset = document.offsetAt(position);
  for (const decl of a.declarations(text)) {
    if (decl.offset > offset || seen.has(decl.name) || decl.name.includes('.') || decl.name.includes(':')) continue;
    seen.add(decl.name);
    const item = new vscode.CompletionItem({ label: decl.name, description: decl.kind }, KIND[decl.kind]);
    item.detail = decl.detail;
    item.sortText = '0' + decl.name;
    items.push(item);
  }
  for (const entry of a.api.entries) {
    if (entry.page !== 'globals' || seen.has(entry.name)) continue;
    const item = entryItem(entry, range);
    item.sortText = '1' + entry.name;
    items.push(item);
  }
  for (const ns of a.STANDARD_NAMESPACES) {
    const lib = a.api.libraries.find((l) => l.module === ns);
    const item = new vscode.CompletionItem(ns, vscode.CompletionItemKind.Module);
    item.documentation = new vscode.MarkdownString(lib ? lib.doc : '');
    item.sortText = '1' + ns;
    items.push(item);
  }
  for (const keyword of a.KEYWORDS) {
    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
    item.sortText = '2' + keyword;
    items.push(item);
  }
  return items;
}

/** The dotted or colon-joined expression under the cursor, up to the hovered word. */
function chainAt(document, position) {
  const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
  if (!wordRange) return undefined;
  const line = document.lineAt(position.line).text;
  const head = line.slice(0, wordRange.end.character);
  const m = head.match(/((?:[A-Za-z_]\w*\s*[.:]\s*)*[A-Za-z_]\w*)$/);
  return { chain: m[1].replace(/\s+/g, ''), range: wordRange };
}

function provideHover(document, position) {
  const target = chainAt(document, position);
  if (!target) return undefined;
  const masked = a.maskText(document.getText());
  const offset = document.offsetAt(target.range.start);
  if (masked[offset] === ' ') return undefined; // inside a string or comment
  const text = document.getText();
  const binds = a.bindings(text);

  const entry = a.entryForChain(target.chain, binds);
  if (entry) return new vscode.Hover(entryDocs(entry), target.range);

  const lib = a.api.libraries.find((l) => l.module === a.canonical(target.chain, binds) || l.module === '@neyuki/' + a.canonical(target.chain, binds));
  if (lib) {
    const md = new vscode.MarkdownString(`**${lib.title}**\n\n${lib.doc.replace(/```lua/g, '```neyuki')}`);
    return new vscode.Hover(md, target.range);
  }

  if (!target.chain.includes('.') && !target.chain.includes(':')) {
    const decl = a.definitionOf(text, target.chain, offset);
    if (decl) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(decl.detail, 'neyuki');
      return new vscode.Hover(md, target.range);
    }
  }
  return undefined;
}

function provideSignatureHelp(document, position) {
  const before = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const call = a.callContext(before);
  if (!call) return undefined;
  const binds = a.bindings(document.getText());
  const entry = a.entryForChain(call.callee, binds);
  if (!entry || !entry.params) return undefined;
  const params = a.callParameters(entry, call.callee);
  const label = `${shortName(entry.name)}(${params.map((p) => p.label).join(', ')})${entry.returns && entry.returns !== '()' ? ': ' + entry.returns : ''}`;
  const signature = new vscode.SignatureInformation(label, entryDocs({ ...entry, signature: label }));
  signature.parameters = params.map((p) => new vscode.ParameterInformation(p.label));
  const help = new vscode.SignatureHelp();
  help.signatures = [signature];
  help.activeSignature = 0;
  const variadic = params.length && params[params.length - 1].name === '...';
  help.activeParameter = variadic ? Math.min(call.activeParameter, params.length - 1) : call.activeParameter;
  return help;
}

function provideDefinition(document, position) {
  const target = chainAt(document, position);
  if (!target) return undefined;
  const text = document.getText();
  const name = target.chain;
  const decl =
    a.definitionOf(text, name, document.offsetAt(position)) ??
    a.declarations(text).find((d) => d.name === name || d.name.endsWith('.' + name) || d.name.endsWith(':' + name));
  if (!decl) return undefined;
  const start = document.positionAt(decl.offset);
  return new vscode.Location(document.uri, new vscode.Range(start, start.translate(0, decl.name.length)));
}

function provideDocumentSymbols(document) {
  const text = document.getText();
  const symbols = [];
  const containers = new Map();
  for (const decl of a.outline(text)) {
    const start = document.positionAt(decl.offset);
    const lineRange = document.lineAt(start.line).range;
    const isFunction = decl.kind === 'function';
    const owner = isFunction ? decl.name.match(/^(.+)[.:][^.:]+$/) : null;
    const symbol = new vscode.DocumentSymbol(
      owner ? shortName(decl.name) : decl.name,
      decl.detail,
      isFunction ? (owner ? vscode.SymbolKind.Method : vscode.SymbolKind.Function) : decl.kind === 'constant' ? vscode.SymbolKind.Constant : vscode.SymbolKind.Variable,
      functionRange(document, start, isFunction) ?? lineRange,
      new vscode.Range(start, start.translate(0, decl.name.length))
    );
    const parent = owner && containers.get(owner[1]);
    if (parent) parent.children.push(symbol);
    else symbols.push(symbol);
    if (!isFunction) containers.set(decl.name, symbol);
  }
  return symbols;
}

/** The lines of a function body, found by matching block keywords with `end`. */
function functionRange(document, start, isFunction) {
  if (!isFunction) return undefined;
  const masked = a.maskText(document.getText());
  const opener = /\b(function|do|then|repeat)\b|\b(end|until)\b/g;
  // The declaration points at the name; the `function` keyword is before it.
  opener.lastIndex = document.offsetAt(start.with(undefined, 0));
  let depth = 0;
  let m;
  while ((m = opener.exec(masked)) !== null) {
    if (m[1] === 'then' || m[1] === 'do') {
      // `elseif ... then` and `for/while ... do` belong to an opened block.
      const lineStart = masked.lastIndexOf('\n', m.index) + 1;
      if (/\belseif\b/.test(masked.slice(lineStart, m.index)) && m[1] === 'then') continue;
    }
    if (m[1]) depth++;
    else if (--depth === 0) return new vscode.Range(start.with(undefined, 0), document.positionAt(m.index + m[0].length));
  }
  return undefined;
}

function activateLanguage(context) {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(SELECTOR, { provideCompletionItems: provideCompletion }, '.', ':', '"', "'", '/'),
    vscode.languages.registerHoverProvider(SELECTOR, { provideHover }),
    vscode.languages.registerSignatureHelpProvider(SELECTOR, { provideSignatureHelp }, { triggerCharacters: ['(', ','], retriggerCharacters: [','] }),
    vscode.languages.registerDefinitionProvider(SELECTOR, { provideDefinition }),
    vscode.languages.registerDocumentSymbolProvider(SELECTOR, { provideDocumentSymbols })
  );
}

module.exports = { activateLanguage };

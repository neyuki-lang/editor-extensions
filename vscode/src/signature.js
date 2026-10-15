// Reading the signatures written in the library reference, such as
// `string.find(s: string, pattern: string, init: number?): (number?, number?)`.

/** Splits `text` at commas that are not nested in brackets. */
function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** The index of the bracket closing the one at `open`, or -1. */
function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** `name: type`, `name: type?`, `...: type` or a bare name as a parameter. */
function parseParam(text) {
  const colon = text.indexOf(':');
  const name = (colon === -1 ? text : text.slice(0, colon)).trim();
  const type = colon === -1 ? 'any' : text.slice(colon + 1).trim();
  return { name, type, optional: type.endsWith('?') || name === '...', label: text };
}

/**
 * Reads a reference heading into `{ name, kind, owner?, params?, returns,
 * signature }`, or null if it is not one.
 */
function parseHeading(heading) {
  const match = heading.match(/^([A-Za-z_@][\w.]*)(?::([A-Za-z_]\w*))?/);
  if (!match) return null;
  const rest = heading.slice(match[0].length);
  const owner = match[2] ? match[1] : undefined;
  const name = match[2] ? `${match[1]}:${match[2]}` : match[1];

  if (rest.startsWith('(')) {
    const close = matchingParen(heading, match[0].length);
    if (close === -1) return null;
    const inner = heading.slice(match[0].length + 1, close);
    const after = heading.slice(close + 1).trim();
    const returns = after.startsWith(':') ? after.slice(1).trim() : '()';
    return {
      name,
      kind: owner ? 'method' : 'function',
      owner,
      params: splitTopLevel(inner).map(parseParam),
      returns,
      signature: heading,
    };
  }
  if (rest.startsWith(':')) {
    return { name, kind: 'value', returns: rest.slice(1).trim(), signature: heading };
  }
  return null;
}

module.exports = { splitTopLevel, matchingParen, parseParam, parseHeading };

// Activates the extension against the mock in vscode-mock.js and calls its
// providers the way the editor would.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registered, settings, createDocument, Position } = require('./vscode-mock');

const extension = require('../src/extension');
extension.activate({ subscriptions: [], asAbsolutePath: (p) => p });

/** A document whose cursor is at `|` in `source`. */
function at(source) {
  const offset = source.indexOf('|');
  const text = source.slice(0, offset) + source.slice(offset + 1);
  const document = createDocument(text);
  return { document, position: document.positionAt(offset) };
}

const labelOf = (item) => (typeof item.label === 'string' ? item.label : item.label.label);

function complete(source) {
  const { document, position } = at(source);
  return (registered.completion[0].provideCompletionItems(document, position) ?? []).map(labelOf);
}

test('completes library members through require bindings', () => {
  const labels = complete('local files = require("@neyuki/fs")\nfiles.re|');
  assert.ok(labels.includes('read') && labels.includes('remove'), labels.join(','));
  assert.ok(!labels.includes('print'));
});

test('completes nested namespaces and object methods', () => {
  assert.ok(complete('local hid = require("@neyuki/hid")\nhid.|').includes('keyboard'));
  assert.ok(complete('local ui = require("@neyuki/ui")\nlocal w = ui.open()\nw:|').includes('fillRect'));
  assert.ok(complete('local s = "x"\ns:|').includes('split'));
});

test('completes modules inside require and nothing inside strings', () => {
  assert.ok(complete('local x = require("@neyuki/|').includes('@neyuki/http'));
  assert.deepEqual(complete('print("math.|")'), []);
});

test('completes locals declared before the cursor, globals and keywords', () => {
  const labels = complete('local total = 1\nlocal function helper() end\n|\nlocal later = 2');
  for (const name of ['total', 'helper', 'print', 'math', 'while']) assert.ok(labels.includes(name), name);
  assert.ok(!labels.includes('later'));
});

test('hover shows the signature and documentation', () => {
  const { document, position } = at('local x = math.cl|amp(5, 0, 1)');
  const hover = registered.hover[0].provideHover(document, position);
  assert.match(hover.contents.value, /math\.clamp\(n: number, min: number, max: number\): number/);
  const local = at('local count: number = 1\nprint(cou|nt)');
  assert.match(registered.hover[0].provideHover(local.document, local.position).contents.value, /local count: number/);
});

test('signature help tracks the active parameter', () => {
  const { document, position } = at('local s = "a,b"\nprint(s:sub(1, |');
  const help = registered.signature[0].provideSignatureHelp(document, position);
  assert.equal(help.signatures[0].label, 'sub(i: number, j: number?): string');
  assert.equal(help.activeParameter, 1);
});

test('go to definition finds the declaration in effect', () => {
  const { document, position } = at('local value = 1\nlocal function f(value)\n  return val|ue\nend');
  const location = registered.definition[0].provideDefinition(document, position);
  assert.equal(location.range.start.line, 1);
});

test('the outline groups methods under their table', () => {
  const document = createDocument('local Account = {}\nfunction Account.new()\n  return {}\nend\nfunction Account:close()\nend\nlocal function helper()\nend');
  const symbols = registered.symbols[0].provideDocumentSymbols(document);
  assert.deepEqual(symbols.map((s) => s.name), ['Account', 'helper']);
  assert.deepEqual(symbols[0].children.map((s) => s.name), ['new', 'close']);
  assert.equal(symbols[1].range.end.line, 7);
});

const binary = ['release', 'debug']
  .map((profile) => path.join(__dirname, '..', '..', '..', 'neyuki', 'target', profile, process.platform === 'win32' ? 'neyuki.exe' : 'neyuki'))
  .find((p) => fs.existsSync(p));

test('lint diagnostics come from the neyuki executable', { skip: !binary && 'no neyuki build next to the extension' }, async () => {
  settings.path = binary;
  const { runLint } = require('../src/lint');
  const items = await runLint('local unused = 1\nprint(missing)\n', path.join(__dirname, 'fixture.nyk'));
  const codes = items.map((i) => `${i.code}@${i.line}:${i.column}`);
  assert.ok(codes.includes('W0001@1:7'), codes.join(' '));
  assert.ok(codes.includes('E0001@2:7'), codes.join(' '));
});

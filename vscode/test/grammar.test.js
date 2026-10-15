// Tokenizes snippets with the same TextMate engine VS Code uses and checks
// the scopes given to the interesting parts.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
const onigLib = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
  createOnigString: (s) => new oniguruma.OnigString(s),
}));

const registry = new textmate.Registry({
  onigLib,
  loadGrammar: async () => {
    const file = path.join(__dirname, '..', 'syntaxes', 'neyuki.tmLanguage.json');
    return textmate.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
  },
});
const grammarReady = registry.loadGrammar('source.neyuki');

/** Every token of `source` as `{ text, scopes }`, line by line. */
async function tokenize(source) {
  const grammar = await grammarReady;
  let state = textmate.INITIAL;
  const tokens = [];
  for (const line of source.split('\n')) {
    const result = grammar.tokenizeLine(line, state);
    for (const token of result.tokens) {
      tokens.push({ text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes });
    }
    state = result.ruleStack;
  }
  return tokens;
}

/** Asserts that the `nth` token whose text is `text` has a scope starting with `scope`. */
function expectScope(tokens, text, scope, nth = 0) {
  const matches = tokens.filter((t) => t.text.trim() === text);
  assert.ok(matches[nth], `no token "${text}" in ${JSON.stringify(tokens.map((t) => t.text))}`);
  const scopes = matches[nth].scopes;
  assert.ok(
    scopes.some((s) => s.startsWith(scope)),
    `"${text}" has ${scopes.join(' ')}, expected ${scope}`
  );
}

function expectNoScope(tokens, text, scope) {
  for (const token of tokens.filter((t) => t.text.trim() === text)) {
    assert.ok(!token.scopes.some((s) => s.startsWith(scope)), `"${text}" should not be ${scope}`);
  }
}

test('block comments span lines and do not leak', async () => {
  const tokens = await tokenize('--[[ first\nsecond line\n]] local after = 1');
  expectScope(tokens, 'second line', 'comment.block');
  expectScope(tokens, 'local', 'storage.modifier');
});

test('block comments with levels close only on the matching bracket', async () => {
  const tokens = await tokenize('--[==[ a ]] b\nstill ]==] done()');
  expectScope(tokens, 'still', 'comment.block');
  expectScope(tokens, 'done', 'entity.name.function.call');
});

test('line comments and decrements', async () => {
  const tokens = await tokenize('count-- -- note\nx = 1 -- trailing');
  expectScope(tokens, '--', 'keyword.operator.increment');
  expectScope(tokens, 'note', 'comment.line');
  expectScope(tokens, 'trailing', 'comment.line');
});

test('long strings and escapes', async () => {
  const tokens = await tokenize('local s = [=[\nraw ]] text\n]=] .. "a\\n\\65\\u{48}"');
  expectScope(tokens, 'raw ]] text', 'string.quoted.other.multiline');
  expectScope(tokens, '\\n', 'constant.character.escape');
  expectScope(tokens, '\\65', 'constant.character.escape');
  expectScope(tokens, '\\u{48}', 'constant.character.escape');
});

test('interpolated strings embed expressions, nested tables included', async () => {
  const tokens = await tokenize('print(`hi {name} has {#{ 1, 2 }} \\{x}`)');
  expectScope(tokens, 'name', 'meta.embedded.expression');
  expectScope(tokens, '1', 'constant.numeric');
  expectScope(tokens, 'has', 'string.interpolated');
  expectNoScope(tokens, 'has', 'meta.embedded');
  expectScope(tokens, '\\{', 'constant.character.escape');
});

test('function definitions, methods and parameters', async () => {
  const tokens = await tokenize('function Account.new(owner: string, ...: number): Account\nfunction Account:deposit(amount)');
  expectScope(tokens, 'Account.', 'entity.name.namespace');
  expectScope(tokens, 'new', 'entity.name.function');
  expectScope(tokens, 'owner', 'variable.parameter');
  expectScope(tokens, 'string', 'support.type.primitive');
  expectScope(tokens, 'Account', 'entity.name.type', 0);
  expectScope(tokens, 'Account', 'entity.name.type', 1);
  expectScope(tokens, 'deposit', 'entity.name.function');
  expectScope(tokens, 'amount', 'variable.parameter');
});

test('type annotations do not swallow method calls', async () => {
  const tokens = await tokenize('local n: number? = s:len()\nlocal list: {string} = {}');
  expectScope(tokens, 'number', 'support.type.primitive');
  expectScope(tokens, 'len', 'entity.name.function.method');
  expectNoScope(tokens, 'len', 'support.type');
  expectScope(tokens, 'string', 'support.type.primitive');
});

test('a one-line body after a return type is code', async () => {
  const tokens = await tokenize('local function f(): () count = count + 1 end');
  expectScope(tokens, 'count', 'source.neyuki');
  expectNoScope(tokens, 'count', 'entity.name.type');
  expectScope(tokens, 'end', 'keyword.control');
});

test('numbers', async () => {
  const tokens = await tokenize('x = 0xff + 0b1010 + 1_000 + 2.5e3 + .5');
  expectScope(tokens, '0xff', 'constant.numeric.hex');
  expectScope(tokens, '0b1010', 'constant.numeric.binary');
  expectScope(tokens, '1_000', 'constant.numeric.integer');
  expectScope(tokens, '2.5e3', 'constant.numeric.float');
  expectScope(tokens, '.5', 'constant.numeric.float');
});

test('libraries, builtins and operators', async () => {
  const tokens = await tokenize('local v = math.floor(x ?? 0) .. tostring(y)\ntotal += 1');
  expectScope(tokens, 'math', 'support.class.library');
  expectScope(tokens, 'floor', 'support.function.library');
  expectScope(tokens, '??', 'keyword.operator.coalesce');
  expectScope(tokens, '..', 'keyword.operator.concatenation');
  expectScope(tokens, 'tostring', 'support.function.builtin');
  expectScope(tokens, '+=', 'keyword.operator.assignment.compound');
});

test('control flow keywords', async () => {
  const tokens = await tokenize('for i = 1, 10 do if i != 3 then continue end end');
  expectScope(tokens, 'for', 'keyword.control.loop');
  expectScope(tokens, 'continue', 'keyword.control.loop');
  expectScope(tokens, '!=', 'keyword.operator.comparison');
});

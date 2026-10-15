// Tokenizes every .nyk file in the sibling language repository and checks
// that no region (a string, comment, type or table) stays open past the end
// of its statement, which shows up as the file ending inside it.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

const repo = path.join(__dirname, '..', '..', '..', 'neyuki');

function nykFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return nykFiles(full);
    return entry.name.endsWith('.nyk') ? [full] : [];
  });
}

const files = ['lib', 'tests', 'examples'].flatMap((d) => nykFiles(path.join(repo, d)));

test('every file in the language repository closes its regions', { skip: files.length === 0 }, async () => {
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
  await oniguruma.loadWASM(wasm);
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p) => new oniguruma.OnigScanner(p),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async () => {
      const file = path.join(__dirname, '..', 'syntaxes', 'neyuki.tmLanguage.json');
      return textmate.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
    },
  });
  const grammar = await registry.loadGrammar('source.neyuki');
  const leaks = [];
  for (const file of files) {
    let state = textmate.INITIAL;
    const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, index) => {
      const result = grammar.tokenizeLine(line, state);
      state = result.ruleStack;
      // A statement that starts a line at the top level should not be
      // tokenized inside a type annotation or a stray table.
      if (/^(local|function|return|if|for|while|print)\b/.test(line)) {
        const first = result.tokens[0];
        const bad = first.scopes.find((s) =>
          /^(meta\.type|support\.type|entity\.name\.type|string|comment)/.test(s)
        );
        if (bad) leaks.push(`${path.relative(repo, file)}:${index + 1} starts inside ${bad}`);
      }
    });
    if (state.depth > 1) leaks.push(`${path.relative(repo, file)} ends inside an open region`);
  }
  assert.deepEqual(leaks, []);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/analysis');

test('bindings follow require, annotations, known calls and literals', () => {
  const binds = a.bindings([
    'local files = require("@neyuki/fs")',
    'local ui = require("@neyuki/ui")',
    'local win = ui.open({ title = "x" })',
    'local db: Connection = nil',
    'local name = "yuki"',
  ].join('\n'));
  assert.deepEqual(binds.get('files'), { namespace: 'fs' });
  assert.deepEqual(binds.get('win'), { type: 'Window' });
  assert.deepEqual(binds.get('db'), { type: 'Connection' });
  assert.deepEqual(binds.get('name'), { type: 'string' });
  assert.deepEqual(binds.get('math'), { namespace: 'math' });
});

test('members of namespaces include nested namespaces', () => {
  const hid = a.namespaceMembers('hid').map((e) => e.name);
  assert.ok(hid.includes('hid.keyboard') && hid.includes('hid.mouse'));
  const keyboard = a.namespaceMembers('hid.keyboard').map((e) => e.name);
  assert.ok(keyboard.includes('hid.keyboard.tap'));
  assert.ok(a.namespaceMembers('math').some((e) => e.name === 'math.pi' && e.kind === 'value'));
});

test('completion contexts', () => {
  assert.deepEqual(a.completionContext('local x = math.fl'), { kind: 'member', chain: 'math', prefix: 'fl' });
  assert.deepEqual(a.completionContext('hid.keyboard.'), { kind: 'member', chain: 'hid.keyboard', prefix: '' });
  assert.deepEqual(a.completionContext('win:cl'), { kind: 'method', receiver: 'win', prefix: 'cl' });
  assert.deepEqual(a.completionContext('("abc"):up'), { kind: 'method', receiver: 'string', prefix: 'up' });
  assert.deepEqual(a.completionContext('local n: num'), { kind: 'type', prefix: 'num' });
  assert.deepEqual(a.completionContext('function f(a: str'), { kind: 'type', prefix: 'str' });
  assert.deepEqual(a.completionContext('local m = require("@neyuki/'), { kind: 'module', prefix: '@neyuki/' });
  assert.deepEqual(a.completionContext('  pri'), { kind: 'global', prefix: 'pri' });
  assert.equal(a.completionContext('x = "a.b').kind, 'none');
  assert.equal(a.completionContext('-- see math.fl').kind, 'none');
  assert.deepEqual(a.completionContext('print(`total: {math.fl'), { kind: 'member', chain: 'math', prefix: 'fl' });
});

test('methods for typed and string receivers', () => {
  const binds = a.bindings('local ui = require("@neyuki/ui")\nlocal win = ui.open()');
  assert.ok(a.methodsFor('win', binds).some((e) => e.name === 'Window:fillRect'));
  assert.ok(a.methodsFor('line', binds).some((e) => e.name === 'string.split'));
});

test('call context finds the callee and the argument', () => {
  assert.deepEqual(a.callContext('math.clamp(x, 0, '), { callee: 'math.clamp', activeParameter: 2 });
  assert.deepEqual(a.callContext('print(f(a, b), '), { callee: 'print', activeParameter: 1 });
  assert.deepEqual(a.callContext('fs.write("a, b", '), { callee: 'fs.write', activeParameter: 1 });
  assert.deepEqual(a.callContext('t:sub({ 1, 2 }, '), { callee: 't:sub', activeParameter: 1 });
  assert.equal(a.callContext('print(x)'), null);
  assert.equal(a.callContext('if ('), null);
});

test('entries resolve through bindings and receiver types', () => {
  const binds = a.bindings('local f = require("@neyuki/fs")\nlocal ui = require("@neyuki/ui")\nlocal w = ui.open()\nlocal s = "x"');
  assert.equal(a.entryForChain('f.read', binds).name, 'fs.read');
  assert.equal(a.entryForChain('w:present', binds).name, 'Window:present');
  const sub = a.entryForChain('s:sub', binds);
  assert.equal(sub.name, 'string.sub');
  assert.deepEqual(a.callParameters(sub, 's:sub').map((p) => p.name), ['i', 'j']);
});

test('declarations, definitions and the outline', () => {
  const text = [
    'local Account = {}',
    'function Account.new(owner: string)',
    '    local balance: number = 0',
    '    return setmetatable({ owner = owner }, Account)',
    'end',
    'function Account:deposit(amount)',
    '    for i, v in items do end',
    'end',
    '-- local fake = 1',
    'local s = "local inside = 1"',
  ].join('\n');
  const names = a.declarations(text).map((d) => `${d.kind}:${d.name}`);
  for (const expected of ['variable:Account', 'function:Account.new', 'parameter:owner', 'variable:balance', 'function:Account:deposit', 'parameter:amount', 'parameter:self', 'variable:i', 'variable:v', 'variable:s']) {
    assert.ok(names.includes(expected), `missing ${expected} in ${names}`);
  }
  assert.ok(!names.some((n) => n.endsWith(':fake') || n.endsWith(':inside')), 'comments and strings are ignored');
  const def = a.definitionOf(text, 'owner', text.indexOf('owner = owner'));
  assert.equal(def.kind, 'parameter');
  const outline = a.outline(text).map((d) => d.name);
  assert.deepEqual(outline, ['Account', 'Account.new', 'Account:deposit', 's']);
});

test('masking keeps offsets and hides strings and comments', () => {
  const text = 'x = "a--b" -- c\n--[[ d\n]] y = [[e]]';
  const masked = a.maskText(text);
  assert.equal(masked.length, text.length);
  assert.ok(!/[abcde]/.test(masked));
  assert.ok(masked.includes('y ='));
  const interp = a.maskText('`hi {name} there`');
  assert.equal(interp, '`   {name}      `');
});

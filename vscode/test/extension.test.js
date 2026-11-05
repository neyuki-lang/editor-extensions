// Activates the extension against the mocks in vscode-mock.js. Language
// features live in the server, so what is tested here is the client around it:
// starting, restarting, upgrades, the settings applied in the middleware, and
// that a missing executable does not break activation.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { vscode, registered, settings, messages, languageClient } = require('./vscode-mock');

const exe = require('../src/executable');
const { activateClient, deactivateClient } = require('../src/client');
const extension = require('../src/extension');

const realInstalledVersion = exe.installedVersion;
const realNow = Date.now;
const missingBinary = path.join(__dirname, 'no-such-neyuki-binary');

beforeEach(() => {
  languageClient.instances.length = 0;
  languageClient.failStart = false;
  languageClient.serverInfo = { name: 'neyuki', version: '0.6.4' };
  messages.warnings.length = 0;
  messages.infos.length = 0;
  for (const key of Object.keys(settings)) delete settings[key];
  exe.installedVersion = realInstalledVersion;
  Date.now = realNow;
});

/** Makes `neyuki --version` answer from `state.version` (undefined: it fails), counting calls. */
function fakeVersion(state) {
  state.calls = 0;
  exe.installedVersion = async () => {
    state.calls++;
    return { missing: false, version: state.version };
  };
}

const newContext = () => ({ subscriptions: [] });
const last = () => languageClient.instances[languageClient.instances.length - 1];
const statusItem = () => registered.statusItems[registered.statusItems.length - 1];

test('parseVersion reads the output of neyuki --version', () => {
  assert.equal(exe.parseVersion('neyuki 0.6.4\n'), '0.6.4');
  assert.equal(exe.parseVersion('neyuki 0.6.4\r\n'), '0.6.4');
  assert.equal(exe.parseVersion('Neyuki v0.7.0-dev (abc123)\n'), '0.7.0-dev');
  assert.equal(exe.parseVersion('  neyuki   1.0.0'), '1.0.0');
  assert.equal(exe.parseVersion('v22.1.0'), undefined);
  assert.equal(exe.parseVersion('neyuki'), undefined);
  assert.equal(exe.parseVersion(''), undefined);
  assert.equal(exe.parseVersion(undefined), undefined);
});

test('activation registers every command and survives a missing executable', async () => {
  settings.path = missingBinary;
  assert.doesNotThrow(() => extension.activate(newContext()));
  for (const command of ['neyuki.restartServer', 'neyuki.stopServer', 'neyuki.showServerOutput', 'neyuki.runFile', 'neyuki.debugFile']) {
    assert.equal(typeof registered.commands[command], 'function', command);
  }
  // Runs after the start that activation began, so the outcome is settled.
  await registered.commands['neyuki.restartServer']();
  assert.equal(languageClient.instances.length, 0, 'no client for a missing executable');
  assert.ok(messages.warnings.some((m) => m.includes('Could not run')), messages.warnings.join('|'));
});

test('a client that fails to start does not reject or crash activation', async () => {
  fakeVersion({ version: '0.6.4' });
  languageClient.failStart = true;
  await assert.doesNotReject(activateClient(newContext()));
  assert.equal(languageClient.instances.length, 1);
});

test('the client runs `neyuki lsp` for file and untitled neyuki documents', async () => {
  settings.path = 'C:/tools/neyuki.exe';
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  const { serverOptions, clientOptions } = last();
  assert.equal(serverOptions.command, 'C:/tools/neyuki.exe');
  assert.deepEqual(serverOptions.args, ['lsp']);
  assert.deepEqual(clientOptions.documentSelector, [
    { language: 'neyuki', scheme: 'file' },
    { language: 'neyuki', scheme: 'untitled' },
  ]);
});

test('the status bar shows the server version and opens the output', async () => {
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  assert.equal(statusItem().text, 'Neyuki 0.6.4');
  assert.equal(statusItem().command, 'neyuki.showServerOutput');
  registered.commands['neyuki.showServerOutput']();
  assert.equal(last().outputShown, 1);
});

test('the status bar is only shown for neyuki files', async () => {
  fakeVersion({ version: '0.6.4' });
  vscode.window.activeTextEditor = { document: { languageId: 'neyuki' } };
  await activateClient(newContext());
  assert.equal(statusItem().visible, true);
  vscode.window.activeTextEditor = { document: { languageId: 'lua' } };
  registered.activeEditorChange[registered.activeEditorChange.length - 1]();
  assert.equal(statusItem().visible, false);
  vscode.window.activeTextEditor = undefined;
});

test('a server without serverInfo gets a single upgrade warning', async () => {
  fakeVersion({ version: '0.5.0' });
  languageClient.serverInfo = undefined;
  await activateClient(newContext());
  await registered.commands['neyuki.restartServer']();
  assert.equal(languageClient.instances.length, 2);
  const upgrade = messages.warnings.filter((m) => /upgrade/i.test(m));
  assert.equal(upgrade.length, 1, messages.warnings.join('|'));
});

test('neyuki.lint.enable false hides the diagnostics of the server', async () => {
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  const { handleDiagnostics } = last().clientOptions.middleware;
  const uri = vscode.Uri.file('C:/a.nyk');
  const diagnostics = [{ message: 'unused' }];
  let received;
  const next = (_uri, list) => (received = list);

  handleDiagnostics(uri, diagnostics, next);
  assert.deepEqual(received, diagnostics);

  settings['lint.enable'] = false;
  handleDiagnostics(uri, diagnostics, next);
  assert.deepEqual(received, []);
});

test('neyuki.completion.insertParentheses controls snippets and parameter hints', async () => {
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  const { provideCompletionItem } = last().clientOptions.middleware;
  const items = () => [
    { label: 'floor', kind: vscode.CompletionItemKind.Function, insertText: new vscode.SnippetString('floor($0)') },
    { label: { label: 'abs', detail: '(n)' }, kind: vscode.CompletionItemKind.Method, insertText: new vscode.SnippetString('abs()$0') },
    { label: 'plain', insertText: 'plain' },
    { label: 'noInsertText' },
  ];
  const call = (list) => provideCompletionItem({}, {}, {}, {}, async () => list);

  const kept = await call(items());
  assert.ok(kept[0].insertText instanceof vscode.SnippetString);
  // Parameter hints open after completing a function, since its "(" is inserted, not typed.
  assert.equal(kept[0].command.command, 'editor.action.triggerParameterHints');
  assert.equal(kept[1].command.command, 'editor.action.triggerParameterHints');
  assert.equal(kept[2].command, undefined);

  settings['completion.insertParentheses'] = false;
  const plain = await call(items());
  assert.deepEqual(plain.map((i) => i.insertText), ['floor', 'abs', 'plain', undefined]);

  const list = await call({ isIncomplete: true, items: items() });
  assert.equal(list.items[0].insertText, 'floor');
  assert.equal(list.isIncomplete, true);
  assert.equal(await call(undefined), undefined);
});

test('restart replaces the client, and the old one is disposed', async () => {
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  await registered.commands['neyuki.restartServer']();
  assert.equal(languageClient.instances.length, 2);
  assert.equal(languageClient.instances[0].disposed, true);
  assert.equal(languageClient.instances[1].disposed, false);
});

test('changing neyuki.path or neyuki.lint.enable restarts, other settings do not', async () => {
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  const onChange = registered.configChange[registered.configChange.length - 1];
  await onChange({ affectsConfiguration: (key) => key === 'neyuki.completion.insertParentheses' });
  assert.equal(languageClient.instances.length, 1);
  await onChange({ affectsConfiguration: (key) => key === 'neyuki.path' });
  assert.equal(languageClient.instances.length, 2);
  await onChange({ affectsConfiguration: (key) => key === 'neyuki.lint.enable' });
  assert.equal(languageClient.instances.length, 3);
});

test('a window focus restarts the client when the executable was upgraded, at most every 30 seconds', async () => {
  const state = { version: '0.6.4' };
  fakeVersion(state);
  let now = 1_000_000;
  Date.now = () => now;
  await activateClient(newContext());
  const focus = (focused = true) => registered.windowState[registered.windowState.length - 1]({ focused });
  assert.equal(state.calls, 1); // the probe at start

  await focus(false);
  assert.equal(state.calls, 1, 'losing focus does not check');

  await focus();
  assert.equal(state.calls, 2);
  assert.equal(languageClient.instances.length, 1, 'same version: no restart');

  state.version = '0.6.5';
  languageClient.serverInfo = { name: 'neyuki', version: '0.6.5' };
  now += 10_000;
  await focus();
  assert.equal(state.calls, 2, 'throttled');
  assert.equal(languageClient.instances.length, 1);

  now += 30_000;
  await focus();
  assert.equal(languageClient.instances.length, 2, 'upgraded: restart');
  assert.equal(statusItem().text, 'Neyuki 0.6.5');

  // A failed check changes nothing.
  state.version = undefined;
  now += 31_000;
  await focus();
  assert.equal(languageClient.instances.length, 2);
});

test('a stopped server is not started again by a focus until it is restarted', async () => {
  const state = { version: '0.6.4' };
  fakeVersion(state);
  let now = 1_000_000;
  Date.now = () => now;
  await activateClient(newContext());
  await registered.commands['neyuki.stopServer']();
  assert.equal(last().disposed, true);

  state.version = '0.6.5';
  now += 31_000;
  await registered.windowState[registered.windowState.length - 1]({ focused: true });
  assert.equal(languageClient.instances.length, 1);

  await registered.commands['neyuki.restartServer']();
  assert.equal(languageClient.instances.length, 2);
  assert.equal(last().disposed, false);
});

test('deactivate stops the client and returns a promise', async () => {
  fakeVersion({ version: '0.6.4' });
  await activateClient(newContext());
  const result = extension.deactivate();
  assert.ok(result && typeof result.then === 'function');
  await result;
  assert.equal(last().disposed, true);
  await deactivateClient();
});

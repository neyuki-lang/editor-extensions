// The client of `neyuki lsp`, the language server built into the executable:
// completion, hover, diagnostics, navigation and refactoring all come from it,
// so upgrading Neyuki upgrades them without a new version of this extension.

const vscode = require('vscode');
const { LanguageClient } = require('vscode-languageclient/node');
const exe = require('./executable');

/** The least time between two checks for an upgraded executable. */
const UPGRADE_CHECK_INTERVAL = 30_000;

/** Settings the server does not read; changing them restarts it. */
const RESTARTING_SETTINGS = ['neyuki.path', 'neyuki.lint.enable'];

const config = () => vscode.workspace.getConfiguration('neyuki');

/** The label of a completion item, which is a string or `{ label, ... }`. */
function labelOf(item) {
  return typeof item.label === 'string' ? item.label : item.label.label;
}

/** Options for the client; the settings the server does not read are applied in the middleware. */
function clientOptions() {
  return {
    documentSelector: [
      { language: 'neyuki', scheme: 'file' },
      { language: 'neyuki', scheme: 'untitled' },
    ],
    middleware: {
      handleDiagnostics(uri, diagnostics, next) {
        next(uri, config().get('lint.enable', true) ? diagnostics : []);
      },
      async provideCompletionItem(document, position, context, token, next) {
        const result = await next(document, position, context, token);
        if (!result) return result;
        const parentheses = config().get('completion.insertParentheses', true);
        const items = Array.isArray(result) ? result : result.items;
        for (const item of items) {
          if (!(item.insertText instanceof vscode.SnippetString)) continue;
          if (!parentheses) {
            item.insertText = labelOf(item);
          } else if (!item.command && (item.kind === vscode.CompletionItemKind.Function || item.kind === vscode.CompletionItemKind.Method)) {
            // The server inserts `name($0)`, so the `(` that triggers signature help is never typed.
            item.command = { command: 'editor.action.triggerParameterHints', title: 'Parameter hints' };
          }
        }
        return result;
      },
    },
  };
}

/** Stops the client of the running extension; set by `activateClient`. */
let shutdown;

/**
 * Starts the client in the background. Returns a promise that resolves once
 * the first start has finished or failed; nothing else depends on it.
 */
function activateClient(context) {
  let client; // the current LanguageClient, kept after a failed start for its output
  let startedWith; // the version `--version` reported when the client was started
  let stopped = false; // the user stopped the server: do not follow upgrades until it is restarted
  let warnedOld = false;
  let lastCheck = 0;
  // Starts and stops run one after another.
  let queue = Promise.resolve();

  const status = vscode.window.createStatusBarItem('neyuki.server', vscode.StatusBarAlignment.Right, 0);
  status.name = 'Neyuki Language Server';
  status.command = 'neyuki.showServerOutput';
  context.subscriptions.push(status);

  /** Sets the status bar text, shown while a Neyuki file is the active editor. */
  function updateStatus(text, tooltip) {
    if (text !== undefined) {
      status.text = text;
      status.tooltip = tooltip;
    }
    const editor = vscode.window.activeTextEditor;
    if (status.text && editor && editor.document.languageId === 'neyuki') status.show();
    else status.hide();
  }

  async function stopClient() {
    const old = client;
    client = undefined;
    if (!old) return;
    try {
      await old.dispose();
    } catch (err) {
      console.error('neyuki: stopping the language server failed:', err);
    }
  }

  async function startClient() {
    stopped = false;
    const command = exe.executable();
    const probe = await exe.installedVersion(command);
    startedWith = probe.version;
    if (probe.missing) {
      updateStatus('$(warning) Neyuki', `Could not run "${command}"`);
      exe.reportMissing();
      return;
    }
    updateStatus('$(sync~spin) Neyuki', 'Starting the language server');
    const next = new LanguageClient(
      'neyuki',
      'Neyuki',
      // windowsHide is handed to child_process.spawn; the typings do not list it.
      { command, args: ['lsp'], options: { windowsHide: true } },
      clientOptions()
    );
    client = next;
    try {
      await next.start();
    } catch (err) {
      console.error('neyuki: the language server did not start:', err);
      updateStatus('$(warning) Neyuki', 'The language server did not start. Click to show its output.');
      return;
    }
    const info = next.initializeResult && next.initializeResult.serverInfo;
    if (!info) {
      updateStatus('$(warning) Neyuki', 'This Neyuki is too old for the language server features.');
      if (!warnedOld) {
        warnedOld = true;
        vscode.window.showWarningMessage(
          'This version of Neyuki is too old for completion, hover and diagnostics in the editor. Upgrade Neyuki to enable them.'
        );
      }
      return;
    }
    const version = info.version || startedWith;
    updateStatus(version ? `Neyuki ${version}` : 'Neyuki', 'Neyuki language server. Click to show its output.');
  }

  /** Restarts the server, or starts it if it is not running. */
  function restart() {
    queue = queue.then(stopClient).then(startClient).catch((err) => console.error('neyuki:', err));
    return queue;
  }

  /** Stops the server and leaves it stopped, which frees the executable on Windows. */
  function stop() {
    queue = queue
      .then(async () => {
        stopped = true;
        await stopClient();
        updateStatus('$(circle-slash) Neyuki', 'The language server is stopped. Run "Neyuki: Restart Language Server" to start it.');
      })
      .catch((err) => console.error('neyuki:', err));
    return queue;
  }

  /** Restarts when the executable now reports another version than the one running. */
  async function followUpgrades() {
    if (stopped) return;
    const probe = await exe.installedVersion(exe.executable());
    if (stopped || !probe.version || probe.version === startedWith) return;
    await restart();
  }

  shutdown = () => {
    queue = queue.then(stopClient).catch((err) => console.error('neyuki:', err));
    return queue;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('neyuki.restartServer', restart),
    vscode.commands.registerCommand('neyuki.stopServer', stop),
    vscode.commands.registerCommand('neyuki.showServerOutput', () => {
      if (client) client.outputChannel.show(true);
      else vscode.window.showInformationMessage('The Neyuki language server is not running.');
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (RESTARTING_SETTINGS.some((setting) => e.affectsConfiguration(setting))) return restart();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatus()),
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) return;
      const now = Date.now();
      if (now - lastCheck < UPGRADE_CHECK_INTERVAL) return;
      lastCheck = now;
      return followUpgrades().catch((err) => console.error('neyuki:', err));
    }),
    { dispose: () => shutdown() }
  );

  return restart();
}

/** Stops the client; VS Code waits for the returned promise. */
function deactivateClient() {
  return shutdown ? shutdown() : undefined;
}

module.exports = { activateClient, deactivateClient };

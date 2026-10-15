// Live diagnostics from `neyuki lint --json --stdin`, run on the unsaved
// contents of each open document as it changes.

const vscode = require('vscode');
const cp = require('node:child_process');
const path = require('node:path');
const { executable, reportMissing } = require('./executable');

/** Diagnostics that mark code as unused, which VS Code fades out. */
const UNNECESSARY = new Set(['W0001', 'W0002', 'W0004']);

const SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
  help: vscode.DiagnosticSeverity.Hint,
};

/** Runs the checker on `text` and resolves to its parsed diagnostics. */
function runLint(text, fileName) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(executable(), ['lint', '--json', '--stdin', fileName], {
      cwd: path.dirname(fileName),
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', () => {
      const start = stdout.indexOf('[');
      if (start === -1) {
        reject(new Error(stderr.trim() || 'neyuki lint produced no output'));
        return;
      }
      try {
        resolve(JSON.parse(stdout.slice(start)));
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
}

function toDiagnostic(item, document) {
  const line = Math.max(0, Math.min(item.line - 1, document.lineCount - 1));
  const text = document.lineAt(line).text;
  let start = Math.max(0, item.column - 1);
  let end = item.endLine === item.line ? Math.max(start, item.endColumn - 1) : text.length;
  if (end <= start) {
    // A position without a length marks the rest of the line's code.
    start = text.length - text.trimStart().length;
    end = text.trimEnd().length;
  }
  const range = new vscode.Range(line, Math.min(start, text.length), line, Math.min(end, text.length));
  const message = item.help ? `${item.message}\n${item.help}` : item.message;
  const diagnostic = new vscode.Diagnostic(range, message, SEVERITY[item.severity] ?? vscode.DiagnosticSeverity.Warning);
  diagnostic.source = 'neyuki';
  if (item.code) diagnostic.code = item.code;
  if (UNNECESSARY.has(item.code)) diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
  return diagnostic;
}

/** Wires diagnostics to document events. */
function activateLint(context) {
  const collection = vscode.languages.createDiagnosticCollection('neyuki');
  const timers = new Map();
  const versions = new Map();
  context.subscriptions.push(collection);

  const config = () => vscode.workspace.getConfiguration('neyuki');

  async function check(document) {
    if (document.languageId !== 'neyuki' || document.uri.scheme === 'git') return;
    if (!config().get('lint.enable', true)) {
      collection.delete(document.uri);
      return;
    }
    const key = document.uri.toString();
    const version = document.version;
    versions.set(key, version);
    try {
      const fileName = document.uri.scheme === 'file' ? document.fileName : path.join(process.cwd(), 'untitled.nyk');
      const items = await runLint(document.getText(), fileName);
      // A newer edit has started its own check; drop this result.
      if (versions.get(key) !== version || document.isClosed) return;
      collection.set(document.uri, items.map((item) => toDiagnostic(item, document)));
    } catch (err) {
      if (err && err.code === 'ENOENT') reportMissing();
      else console.error('neyuki lint failed:', err);
    }
  }

  function schedule(document, delay) {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => check(document), delay));
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((d) => check(d)),
    vscode.workspace.onDidSaveTextDocument((d) => check(d)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (config().get('lint.onType', true)) schedule(e.document, config().get('lint.delay', 300));
    }),
    vscode.workspace.onDidCloseTextDocument((d) => {
      collection.delete(d.uri);
      clearTimeout(timers.get(d.uri.toString()));
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('neyuki')) vscode.workspace.textDocuments.forEach((d) => check(d));
    })
  );
  vscode.workspace.textDocuments.forEach((d) => check(d));
}

module.exports = { activateLint, runLint };

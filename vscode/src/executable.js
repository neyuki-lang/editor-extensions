// Finding the `neyuki` executable the extension runs, and asking it which
// version it is.

const vscode = require('vscode');
const cp = require('node:child_process');

let warned = false;

/** The configured executable, or `neyuki` from the PATH. */
function executable() {
  const configured = vscode.workspace.getConfiguration('neyuki').get('path', '').trim();
  return configured || 'neyuki';
}

/** Tells the user once that the executable could not be started. */
function reportMissing() {
  if (warned) return;
  warned = true;
  vscode.window
    .showWarningMessage(
      `Could not run "${executable()}". Install Neyuki or set "neyuki.path" to enable completion, diagnostics, running and debugging.`,
      'Open Settings'
    )
    .then((choice) => {
      if (choice) vscode.commands.executeCommand('workbench.action.openSettings', 'neyuki.path');
    });
}

/** The version in the output of `neyuki --version` (`neyuki 0.6.4`), or undefined. */
function parseVersion(output) {
  const match = /^\s*neyuki\s+v?(\S+)/i.exec(String(output));
  return match ? match[1] : undefined;
}

/**
 * Runs `<command> --version`. Resolves to `{ missing, version }`: `missing` is
 * true when the executable does not exist, `version` is undefined when it
 * could not be determined. It never rejects.
 */
function installedVersion(command) {
  return new Promise((resolve) => {
    try {
      cp.execFile(command, ['--version'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
        if (err) resolve({ missing: err.code === 'ENOENT', version: undefined });
        else resolve({ missing: false, version: parseVersion(stdout) });
      });
    } catch {
      resolve({ missing: false, version: undefined });
    }
  });
}

module.exports = { executable, reportMissing, parseVersion, installedVersion };

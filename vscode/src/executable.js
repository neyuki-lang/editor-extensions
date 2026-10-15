// Finding the `neyuki` executable the extension runs.

const vscode = require('vscode');

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
      `Could not run "${executable()}". Install Neyuki or set "neyuki.path" to enable diagnostics, running and debugging.`,
      'Open Settings'
    )
    .then((choice) => {
      if (choice) vscode.commands.executeCommand('workbench.action.openSettings', 'neyuki.path');
    });
}

module.exports = { executable, reportMissing };

// Entry point of the Neyuki extension. Language features come from the
// language server built into the `neyuki` executable (`neyuki lsp`); this
// extension adds highlighting, snippets, and running and debugging.

const { activateClient, deactivateClient } = require('./client');
const { activateRun } = require('./run');

function activate(context) {
  // The server starts in the background so that activation never waits for it
  // and a missing or broken executable cannot stop the rest from working.
  try {
    activateClient(context);
  } catch (err) {
    console.error('neyuki: the language client could not be set up:', err);
  }
  activateRun(context);
}

function deactivate() {
  return deactivateClient();
}

module.exports = { activate, deactivate };

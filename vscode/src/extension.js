// Entry point of the Neyuki extension.

const { activateLanguage } = require('./language');
const { activateLint } = require('./lint');
const { activateRun } = require('./run');

function activate(context) {
  activateLanguage(context);
  activateLint(context);
  activateRun(context);
}

function deactivate() {}

module.exports = { activate, deactivate };

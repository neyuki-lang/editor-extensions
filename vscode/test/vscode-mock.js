// Small stand-ins for the `vscode` and `vscode-languageclient/node` modules,
// enough to activate the extension and drive its client outside the editor.
// Neither module can be loaded outside VS Code, so `require` is intercepted.

const Module = require('node:module');

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
    this.scheme = 'file';
  }
  static file(p) {
    return new Uri(p);
  }
  toString() {
    return 'file://' + this.fsPath;
  }
}

const registered = {
  commands: {},
  configChange: [],
  windowState: [],
  activeEditorChange: [],
  statusItems: [],
};
/** Values of `neyuki.*` settings, keyed without the prefix: `settings['lint.enable']`. */
const settings = {};
/** The messages shown to the user. */
const messages = { warnings: [], infos: [] };
const disposable = { dispose() {} };

const vscode = {
  Uri,
  SnippetString: class {
    constructor(value) {
      this.value = value;
    }
  },
  CompletionItemKind: { Method: 1, Function: 2, Variable: 5, Keyword: 13 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  workspace: {
    getConfiguration: () => ({ get: (key, fallback) => (key in settings ? settings[key] : fallback) }),
    onDidChangeConfiguration: (fn) => (registered.configChange.push(fn), disposable),
    getWorkspaceFolder: () => undefined,
  },
  window: {
    showWarningMessage: async (message) => (messages.warnings.push(message), undefined),
    showInformationMessage: async (message) => (messages.infos.push(message), undefined),
    activeTextEditor: undefined,
    createStatusBarItem: (id, alignment, priority) => {
      const item = {
        id,
        alignment,
        priority,
        text: '',
        visible: false,
        show() {
          this.visible = true;
        },
        hide() {
          this.visible = false;
        },
        dispose() {},
      };
      registered.statusItems.push(item);
      return item;
    },
    onDidChangeActiveTextEditor: (fn) => (registered.activeEditorChange.push(fn), disposable),
    onDidChangeWindowState: (fn) => (registered.windowState.push(fn), disposable),
  },
  commands: {
    registerCommand: (name, fn) => ((registered.commands[name] = fn), disposable),
    executeCommand: async () => undefined,
  },
  debug: {
    registerDebugConfigurationProvider: () => disposable,
    registerDebugAdapterDescriptorFactory: () => disposable,
  },
};

/** Controls the fake `LanguageClient`. */
const languageClient = {
  instances: [],
  failStart: false,
  /** What the fake server answers to `initialize`; undefined is an old binary. */
  serverInfo: { name: 'neyuki', version: '0.6.4' },
};

class LanguageClient {
  constructor(id, name, serverOptions, clientOptions) {
    Object.assign(this, { id, name, serverOptions, clientOptions });
    this.disposed = false;
    this.outputShown = 0;
    this.outputChannel = { show: () => this.outputShown++ };
    languageClient.instances.push(this);
  }
  async start() {
    if (languageClient.failStart) throw new Error('Launching server failed.');
    this.initializeResult = { capabilities: {}, serverInfo: languageClient.serverInfo };
  }
  async dispose() {
    this.disposed = true;
  }
}

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;
  if (request === 'vscode-languageclient/node') return { LanguageClient };
  return originalLoad.call(this, request, ...rest);
};

module.exports = { vscode, registered, settings, messages, languageClient };

// A small stand-in for the `vscode` module, enough to activate the extension
// and call its providers outside the editor.

const Module = require('node:module');

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
  translate(dl = 0, dc = 0) {
    return new Position(this.line + dl, this.character + dc);
  }
  with(line = this.line, character = this.character) {
    return new Position(line, character);
  }
}

class Range {
  constructor(a, b, c, d) {
    if (a instanceof Position) {
      this.start = a;
      this.end = b;
    } else {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    }
  }
}

class MarkdownString {
  constructor(value = '') {
    this.value = value;
  }
  appendMarkdown(s) {
    this.value += s;
    return this;
  }
  appendCodeblock(code, lang) {
    this.value += `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    return this;
  }
}

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

/** A text document over `text`, as VS Code's TextDocument presents it. */
function createDocument(text, fileName = 'C:/work/test.nyk') {
  const lines = text.split('\n');
  const offsetAt = (pos) => {
    let offset = 0;
    for (let i = 0; i < pos.line; i++) offset += lines[i].length + 1;
    return offset + pos.character;
  };
  const positionAt = (offset) => {
    let line = 0;
    while (line < lines.length - 1 && offset > lines[line].length) {
      offset -= lines[line].length + 1;
      line++;
    }
    return new Position(line, offset);
  };
  return {
    uri: Uri.file(fileName),
    fileName,
    languageId: 'neyuki',
    version: 1,
    isClosed: false,
    isDirty: false,
    lineCount: lines.length,
    getText: (range) => (range ? text.slice(offsetAt(range.start), offsetAt(range.end)) : text),
    offsetAt,
    positionAt,
    lineAt: (line) => ({ text: lines[line], range: new Range(line, 0, line, lines[line].length) }),
    getWordRangeAtPosition(pos, regex = /\w+/) {
      const line = lines[pos.line];
      const re = new RegExp(regex.source, 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        if (m.index <= pos.character && pos.character <= m.index + m[0].length && m[0].length) {
          return new Range(pos.line, m.index, pos.line, m.index + m[0].length);
        }
        if (!m[0].length) re.lastIndex++;
      }
      return undefined;
    },
  };
}

const registered = { completion: [], hover: [], signature: [], definition: [], symbols: [], commands: {}, diagnostics: new Map() };
const settings = {};
const disposable = { dispose() {} };
const event = () => disposable;

const vscode = {
  Position,
  Range,
  MarkdownString,
  Uri,
  SnippetString: class {
    constructor(value) {
      this.value = value;
    }
  },
  CompletionItem: class {
    constructor(label, kind) {
      this.label = label;
      this.kind = kind;
    }
  },
  CompletionItemKind: new Proxy({}, { get: (_, k) => k }),
  SymbolKind: new Proxy({}, { get: (_, k) => k }),
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  DiagnosticTag: { Unnecessary: 1, Deprecated: 2 },
  Hover: class {
    constructor(contents, range) {
      this.contents = contents;
      this.range = range;
    }
  },
  SignatureHelp: class {},
  SignatureInformation: class {
    constructor(label, documentation) {
      this.label = label;
      this.documentation = documentation;
      this.parameters = [];
    }
  },
  ParameterInformation: class {
    constructor(label) {
      this.label = label;
    }
  },
  Location: class {
    constructor(uri, range) {
      this.uri = uri;
      this.range = range;
    }
  },
  DocumentSymbol: class {
    constructor(name, detail, kind, range, selectionRange) {
      Object.assign(this, { name, detail, kind, range, selectionRange, children: [] });
    }
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      Object.assign(this, { range, message, severity });
    }
  },
  languages: {
    registerCompletionItemProvider: (_, p) => (registered.completion.push(p), disposable),
    registerHoverProvider: (_, p) => (registered.hover.push(p), disposable),
    registerSignatureHelpProvider: (_, p) => (registered.signature.push(p), disposable),
    registerDefinitionProvider: (_, p) => (registered.definition.push(p), disposable),
    registerDocumentSymbolProvider: (_, p) => (registered.symbols.push(p), disposable),
    createDiagnosticCollection: () => ({
      set: (uri, items) => registered.diagnostics.set(uri.toString(), items),
      delete: (uri) => registered.diagnostics.delete(uri.toString()),
      dispose() {},
    }),
  },
  workspace: {
    getConfiguration: () => ({ get: (key, fallback) => (key in settings ? settings[key] : fallback) }),
    onDidOpenTextDocument: event,
    onDidSaveTextDocument: event,
    onDidChangeTextDocument: event,
    onDidCloseTextDocument: event,
    onDidChangeConfiguration: event,
    textDocuments: [],
    getWorkspaceFolder: () => undefined,
  },
  window: { showWarningMessage: async () => undefined, showInformationMessage: async () => undefined, activeTextEditor: undefined },
  commands: {
    registerCommand: (name, fn) => ((registered.commands[name] = fn), disposable),
    executeCommand: async () => undefined,
  },
  debug: {
    registerDebugConfigurationProvider: () => disposable,
    registerDebugAdapterDescriptorFactory: () => disposable,
  },
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, ...rest);
};

module.exports = { vscode, registered, settings, createDocument, Position };

const {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  DiagnosticSeverity,
  TextDocumentSyncKind,
  CompletionItemKind
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const keywords = [
  'and', 'break', 'const', 'continue', 'do', 'else', 'elseif', 'end', 'false',
  'for', 'function', 'global', 'if', 'in', 'local', 'nil', 'not', 'or',
  'repeat', 'return', 'then', 'true', 'type', 'until', 'while', 'print',
  'require', 'assert', 'tostring', 'tonumber', 'int', 'float', 'bigint', 'typeof'
];

connection.onInitialize(() => ({
  capabilities: {
    completionProvider: {
      triggerCharacters: ['.', ' ', '"', "'", '(', ':', 'i', 'l', 'f', 't']
    },
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
      save: true
    }
  }
}));

function validateTextDocument(textDocument) {
  const text = textDocument.getText();
  const diagnostics = [];

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      return;
    }

    const ifMatch = /\bif\b/.test(line);
    const thenMatch = /\bthen\b/.test(line);
    if (ifMatch && !thenMatch) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: line.length }
        },
        message: 'Neyuki conditionals usually require a then branch.'
      });
    }
  });

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidOpen((event) => {
  validateTextDocument(documents.get(event.textDocument.uri));
});

connection.onDidChangeContent((event) => {
  validateTextDocument(documents.get(event.textDocument.uri));
});

connection.onCompletion((textDocumentPosition) => {
  const doc = documents.get(textDocumentPosition.textDocument.uri);
  if (!doc) {
    return [];
  }

  const text = doc.getText();
  const offset = doc.offsetAt(textDocumentPosition.position);
  const before = text.slice(0, offset);
  const prefix = before.split(/[^A-Za-z_]/).pop() || '';

  return keywords
    .filter((keyword) => keyword.startsWith(prefix))
    .map((keyword) => ({
      label: keyword,
      kind: CompletionItemKind.Keyword,
      insertText: keyword
    }));
});

documents.onDidOpen((event) => validateTextDocument(event.document));
documents.onDidChangeContent((event) => validateTextDocument(event.document));
documents.onDidSave((event) => validateTextDocument(event.document));

documents.listen(connection);
connection.listen();

const {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  DiagnosticSeverity,
  TextDocumentSyncKind,
  CompletionItemKind,
  SymbolKind
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

const keywordDocs = {
  and: 'Logical conjunction. Both values must be truthy for the expression to evaluate to true.',
  break: 'Exits the nearest loop or block immediately.',
  const: 'Declares a constant binding that cannot be reassigned after initialization.',
  continue: 'Skips the remainder of the current loop iteration and continues with the next one.',
  do: 'Introduces a block that can contain local state and statements.',
  else: 'Introduces the fallback branch of an if/elseif chain.',
  elseif: 'Adds another condition check to an if chain.',
  end: 'Closes a block such as if, for, while, function, or repeat.',
  false: 'Boolean literal for false.',
  for: 'Creates a loop that iterates over a range or iterable collection.',
  function: 'Defines a callable Neyuki function or method.',
  global: 'Declares a module-scoped binding visible outside the current local scope.',
  if: 'Conditionally executes a branch when a boolean expression is true.',
  in: 'Tests membership or iterates through a collection in a for loop.',
  local: 'Declares a block-scoped local variable or function binding.',
  nil: 'Represents the absence of a value.',
  not: 'Logical negation. Returns the opposite boolean value.',
  or: 'Logical disjunction. Returns true if either value is truthy.',
  repeat: 'Loops until a condition becomes true after the body runs.',
  return: 'Returns from the current function with zero or more values.',
  then: 'Introduces the body of an if or elseif branch.',
  true: 'Boolean literal for true.',
  type: 'Contextual keyword for type aliases and also the builtin type() function.',
  until: 'Ends a repeat loop when the condition is satisfied.',
  while: 'Repeats a block while a condition remains true.'
};

const builtinDocs = {
  assert: 'Raises an error when a condition is false. Takes a condition and an optional message.',
  bigint: 'Converts a value to a bigint, preserving arbitrary precision integer values.',
  float: 'Converts a value to a float.',
  int: 'Converts a value to an integer, truncating toward zero when needed.',
  print: 'Prints values to standard output (stdout).',
  require: 'Loads a module or file by path at runtime.',
  tostring: 'Converts a value to its string representation.',
  tonumber: 'Attempts to parse a number from a string, returning nil on failure.',
  try: 'Executes a function and captures errors, returning success and failure values.',
  type: 'Returns the base type of a value, such as number, string, or table.',
  typeof: 'Returns the exact runtime type of a value, such as int, float, or bigint.'
};

const allDocs = { ...keywordDocs, ...builtinDocs };

function getWordAtPosition(documentText, offset) {
  const before = documentText.slice(0, offset);
  const after = documentText.slice(offset);
  const beforeMatch = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
  if (beforeMatch) {
    return beforeMatch[0];
  }

  const afterMatch = after.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return afterMatch ? afterMatch[0] : null;
}

function offsetToPosition(text, offset) {
  let line = 0;
  let character = 0;
  for (let i = 0; i < Math.min(offset, text.length); i += 1) {
    if (text[i] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}

function buildDocMarkdown(name, detail) {
  return `**${name}**\n\n${detail}`;
}

function extractSymbols(documentText) {
  const symbols = new Set();
  const regex = /\b(?:local|const|global|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(documentText)) !== null) {
    symbols.add(match[1]);
  }
  return [...symbols].sort();
}

function extractSymbolDefinitions(documentText) {
  const patterns = [
    { regex: /\b(?:local|const|global)\s+([A-Za-z_][A-Za-z0-9_]*)/g, kind: SymbolKind.Variable },
    { regex: /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)/g, kind: SymbolKind.Function }
  ];

  const definitions = [];
  for (const { regex, kind } of patterns) {
    let match;
    while ((match = regex.exec(documentText)) !== null) {
      const name = match[1];
      const start = docIndexToPos(documentText, match.index + match[0].indexOf(name));
      const end = docIndexToPos(documentText, match.index + match[0].indexOf(name) + name.length);
      definitions.push({
        name,
        kind,
        range: {
          start,
          end
        },
        selectionRange: {
          start,
          end
        }
      });
    }
  }

  return definitions;
}

function docIndexToPos(text, index) {
  const safeIndex = Math.max(0, Math.min(index, text.length));
  let line = 0;
  let character = 0;
  for (let i = 0; i < safeIndex; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}

connection.onInitialize(() => ({
  capabilities: {
    completionProvider: {
      triggerCharacters: ['.', ' ', '"', "'", '(', ':', 'i', 'l', 'f', 't']
    },
    hoverProvider: true,
    documentSymbolProvider: true,
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

    if (/\b(?:local|const|global)\b/.test(line) && !/=/.test(line) && !/\bfunction\b/.test(line)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Information,
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: line.length }
        },
        message: 'A declaration without an initializer is allowed only when a type is explicitly annotated.'
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
  const symbols = extractSymbols(text);

  const completionItems = [...Object.keys(allDocs), ...symbols]
    .filter((item) => item.startsWith(prefix))
    .map((item) => ({
      label: item,
      kind: Object.prototype.hasOwnProperty.call(keywordDocs, item) || Object.prototype.hasOwnProperty.call(builtinDocs, item)
        ? CompletionItemKind.Keyword
        : CompletionItemKind.Variable,
      insertText: item,
      documentation: {
        kind: 'markdown',
        value: buildDocMarkdown(item, allDocs[item])
      }
    }));

  return completionItems;
});

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return null;
  }

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  const name = getWordAtPosition(text, offset);
  if (!name) {
    return null;
  }

  const symbolDoc = allDocs[name];
  if (symbolDoc) {
    return {
      contents: {
        kind: 'markdown',
        value: buildDocMarkdown(name, symbolDoc)
      }
    };
  }

  const definitions = extractSymbols(text);
  if (definitions.includes(name)) {
    return {
      contents: {
        kind: 'markdown',
        value: buildDocMarkdown(name, 'User-defined Neyuki symbol declared in the current file.')
      }
    };
  }

  return null;
});

connection.onDocumentSymbol((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const definitions = extractSymbolDefinitions(doc.getText());
  return definitions.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    range: symbol.range,
    selectionRange: symbol.selectionRange
  }));
});

documents.onDidOpen((event) => validateTextDocument(event.document));
documents.onDidChangeContent((event) => validateTextDocument(event.document));
documents.onDidSave((event) => validateTextDocument(event.document));

documents.listen(connection);
connection.listen();

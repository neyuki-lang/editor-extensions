const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

const keywordDocs = {
  and: 'Logical conjunction. Both values must be truthy.',
  break: 'Exits the nearest loop or block immediately.',
  const: 'Declares a constant binding that cannot be reassigned.',
  continue: 'Skips the rest of the current loop iteration.',
  do: 'Introduces a block.',
  else: 'Fallback branch in an if chain.',
  elseif: 'Additional condition in an if chain.',
  end: 'Closes a block such as if, for, while, or function.',
  false: 'Boolean false literal.',
  for: 'Creates a loop.',
  function: 'Defines a callable function.',
  global: 'Declares a module-scoped binding.',
  if: 'Conditionally executes a branch.',
  in: 'Tests membership or loops over values.',
  local: 'Declares a block-scoped local variable.',
  nil: 'Represents the absence of a value.',
  not: 'Logical negation.',
  or: 'Logical disjunction.',
  repeat: 'Loops until a condition becomes true.',
  return: 'Returns from the current function.',
  then: 'Introduces the body of an if/elseif branch.',
  true: 'Boolean true literal.',
  type: 'Contextual keyword for types and the builtin type() function.',
  until: 'Ends a repeat loop when the condition is satisfied.',
  while: 'Repeats a block while a condition remains true.'
};

const builtinDocs = {
  assert: 'Raises an error when a condition is false.',
  bigint: 'Converts a value to a bigint.',
  float: 'Converts a value to a float.',
  int: 'Converts a value to an integer.',
  print: 'Prints values to stdout.',
  require: 'Loads a module or file by path.',
  tostring: 'Converts a value to a string.',
  tonumber: 'Attempts to parse a number from a string.',
  try: 'Executes a function and captures any resulting error.',
  type: 'Returns the base type of a value.',
  typeof: 'Returns the exact runtime type of a value.'
};

const docs = { ...keywordDocs, ...builtinDocs };

function getWordAtPosition(document, position) {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  const beforeMatch = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
  if (beforeMatch) {
    return beforeMatch[0];
  }

  const afterMatch = after.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return afterMatch ? afterMatch[0] : null;
}

function extractSymbolNames(text) {
  const names = new Set();
  const regex = /\b(?:local|const|global|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function markdownDoc(name, description) {
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`**${name}**\n\n${description}`);
  return markdown;
}

function activate(context) {
  const serverModule = context.asAbsolutePath('./server.js');

  const serverOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] }
    }
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'neyuki' }],
    synchronize: {
      fileEvents: [vscode.workspace.createFileSystemWatcher('**/*.nyk')]
    }
  };

  client = new LanguageClient(
    'neyukiLanguageServer',
    'Neyuki Language Server',
    serverOptions,
    clientOptions
  );

  context.subscriptions.push(client.start());

  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'neyuki' },
    {
      provideHover(document, position) {
        const name = getWordAtPosition(document, position);
        if (!name) {
          return undefined;
        }

        const description = docs[name] || 'User-defined Neyuki symbol in the current file.';
        return new vscode.Hover(markdownDoc(name, description));
      }
    }
  );

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'neyuki' },
    {
      provideCompletionItems(document, position) {
        const text = document.getText();
        const offset = document.offsetAt(position);
        const before = text.slice(0, offset);
        const prefix = before.split(/[^A-Za-z_]/).pop() || '';

        const suggestions = [];
        const names = [...new Set([...Object.keys(docs), ...extractSymbolNames(text)])];

        for (const item of names) {
          if (!item.startsWith(prefix)) {
            continue;
          }

          const completion = new vscode.CompletionItem(
            item,
            Object.prototype.hasOwnProperty.call(keywordDocs, item)
              ? vscode.CompletionItemKind.Keyword
              : vscode.CompletionItemKind.Variable
          );

          completion.insertText = item;
          completion.detail = Object.prototype.hasOwnProperty.call(docs, item) ? 'Neyuki builtin or keyword' : 'User-defined Neyuki symbol';
          completion.documentation = markdownDoc(item, docs[item] || 'User-defined Neyuki symbol in the current file.');
          suggestions.push(completion);
        }

        return suggestions;
      }
    },
    '.', ' ', '"', '\'', '(', ':', 'i', 'l', 'f', 't'
  );

  context.subscriptions.push(hoverProvider, completionProvider);
}

function deactivate() {
  if (!client) {
    return Promise.resolve();
  }
  return client.stop();
}

module.exports = {
  activate,
  deactivate
};

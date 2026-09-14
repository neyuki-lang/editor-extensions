const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

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
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/*.nyk')
      ]
    }
  };

  client = new LanguageClient(
    'neyukiLanguageServer',
    'Neyuki Language Server',
    serverOptions,
    clientOptions
  );

  context.subscriptions.push(client.start());

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'neyuki' },
    {
      provideCompletionItems(document, position) {
        const word = document.getText().slice(0, document.offsetAt(position));
        const prefix = word.split(/[^A-Za-z_]/).pop() || '';

        const suggestions = [
          'local', 'const', 'global', 'if', 'then', 'else', 'elseif', 'end',
          'for', 'while', 'repeat', 'until', 'function', 'return', 'break',
          'continue', 'true', 'false', 'nil', 'and', 'or', 'not', 'in', 'type',
          'print', 'require', 'assert', 'tostring', 'tonumber', 'int', 'float', 'bigint', 'typeof'
        ]
          .filter((item) => item.startsWith(prefix))
          .map((item) => {
            const completion = new vscode.CompletionItem(item, vscode.CompletionItemKind.Keyword);
            completion.insertText = item;
            return completion;
          });

        return suggestions;
      }
    },
    '.', ' ', '"', '\'', '(', ':', 'i', 'l', 'f', 't'
  );

  context.subscriptions.push(completionProvider);
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

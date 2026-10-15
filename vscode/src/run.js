// Running and debugging scripts: the Run File command and the `neyuki`
// debug type, whose adapter is `neyuki dap`.

const vscode = require('vscode');
const path = require('node:path');
const { executable } = require('./executable');

/** The directory a script runs in: its workspace folder, or its own folder. */
function workingDirectory(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri.fsPath : path.dirname(uri.fsPath);
}

/** The Neyuki document to act on: the given one or the active editor's. */
async function targetDocument(uri) {
  if (uri instanceof vscode.Uri) return vscode.workspace.openTextDocument(uri);
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'neyuki') return editor.document;
  vscode.window.showInformationMessage('Open a Neyuki file to run it.');
  return undefined;
}

async function runFile(uri) {
  const document = await targetDocument(uri);
  if (!document) return;
  if (document.isDirty && !(await document.save())) return;
  const file = document.uri.fsPath;
  const task = new vscode.Task(
    { type: 'neyuki', file },
    vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.TaskScope.Workspace,
    `run ${path.basename(file)}`,
    'neyuki',
    new vscode.ProcessExecution(executable(), ['run', file], { cwd: workingDirectory(document.uri) })
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, focus: true, clear: true, panel: vscode.TaskPanelKind.Dedicated };
  await vscode.tasks.executeTask(task);
}

async function debugFile(uri) {
  const document = await targetDocument(uri);
  if (!document) return;
  if (document.isDirty && !(await document.save())) return;
  await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), {
    type: 'neyuki',
    request: 'launch',
    name: `Debug ${path.basename(document.fileName)}`,
    program: document.fileName,
  });
}

const configurationProvider = {
  resolveDebugConfiguration(folder, config) {
    // F5 without a launch.json debugs the active file.
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'neyuki') return undefined;
      config.type = 'neyuki';
      config.name = 'Debug current file';
      config.request = 'launch';
      config.program = '${file}';
    }
    if (!config.program) {
      return vscode.window.showInformationMessage('Set "program" to the Neyuki file to debug.').then(() => undefined);
    }
    return config;
  },
};

const adapterFactory = {
  createDebugAdapterDescriptor(session) {
    const program = session.configuration.program;
    const cwd = session.configuration.cwd ?? (program ? workingDirectory(vscode.Uri.file(program)) : undefined);
    return new vscode.DebugAdapterExecutable(executable(), ['dap'], { cwd });
  },
};

function activateRun(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('neyuki.runFile', runFile),
    vscode.commands.registerCommand('neyuki.debugFile', debugFile),
    vscode.debug.registerDebugConfigurationProvider('neyuki', configurationProvider),
    vscode.debug.registerDebugAdapterDescriptorFactory('neyuki', adapterFactory)
  );
}

module.exports = { activateRun };

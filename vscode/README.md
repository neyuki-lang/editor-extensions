# Neyuki for Visual Studio Code

Language support for [Neyuki](https://neyuki.cc), a small scripting language for everyday programs.

## Features

- **Highlighting** for the whole language: block comments and long strings at any level, backtick strings with highlighted `{expressions}`, type annotations, method definitions, numbers with `_`, hex and binary, and every operator.
- **Language server features** from the server built into `neyuki` (`neyuki lsp`): completion with documentation for every built-in function and bundled module, hover, signature help, Go to Definition, Find All References, Rename, document highlights, outline and breadcrumbs, folding, workspace symbols and formatting.
- **Live diagnostics** from the same server as you type: syntax errors, undefined names, `const` reassignments, type mismatches, unused variables (faded) and unreachable code.
- **Run and debug**: the run button in the editor title or <kbd>Ctrl</kbd>+<kbd>F5</kbd> runs the current file; <kbd>F5</kbd> debugs it with breakpoints, stepping, the call stack and variables, through `neyuki dap`.
- **Snippets** for functions, loops, classes, modules, a window loop and an HTTP server, plus `-- #region` folding.

## Requirements

Completion, hover, diagnostics, navigation, running and debugging all use the `neyuki` executable. Put it on your `PATH`, or set `neyuki.path` to its location. Highlighting and snippets work without it.

The editor features are the language server inside `neyuki`, so they are as new as your Neyuki: upgrade it and the features follow, with no update of the extension. A new `neyuki` is picked up when the VS Code window regains focus (checked at most every 30 seconds). This needs a Neyuki that reports `serverInfo` in its language server; with an older one the extension asks you to upgrade, and there is no offline fallback for completion and hover.

The status bar shows `Neyuki <version>` in Neyuki files; click it to see the server's output.

### Upgrading on Windows

While the server runs, Windows keeps `neyuki.exe` locked, so replacing it in place can fail with "access denied". Run **Neyuki: Stop Language Server** from the Command Palette, upgrade Neyuki, then run **Neyuki: Restart Language Server**. A stopped server is not started again by the automatic check until you restart it.

## Commands

| Command | |
| --- | --- |
| `Neyuki: Run File` / `Neyuki: Debug File` | Run or debug the current file |
| `Neyuki: Restart Language Server` | Restart the server, or start it if it is stopped |
| `Neyuki: Stop Language Server` | Stop it, for example to replace `neyuki.exe` on Windows |
| `Neyuki: Show Language Server Output` | Open the server's log |

## Settings

| Setting | Default | |
| --- | --- | --- |
| `neyuki.path` | `""` | Path to `neyuki`; empty uses the `PATH`. Changing it restarts the server |
| `neyuki.lint.enable` | `true` | Show diagnostics. Changing it restarts the server |
| `neyuki.completion.insertParentheses` | `true` | Add `()` when completing a function |

The server decides when to check files, so the settings `neyuki.lint.onType` and `neyuki.lint.delay` of earlier versions no longer exist.

## Debugging

Press <kbd>F5</kbd> in a `.nyk` file to debug it without any setup. For more control, add a configuration to `launch.json`:

```json
{
  "type": "neyuki",
  "request": "launch",
  "name": "Debug main",
  "program": "${workspaceFolder}/main.nyk",
  "stopOnEntry": false
}
```

## Development

```bash
npm install
npm test          # grammar and extension tests
npm run package   # build a .vsix
```

Open this folder in VS Code and press <kbd>F5</kbd> to try the extension in a new window.

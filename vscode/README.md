# Neyuki for Visual Studio Code

Language support for [Neyuki](https://neyuki.cc), a small scripting language for everyday programs.

## Features

- **Highlighting** for the whole language: block comments and long strings at any level, backtick strings with highlighted `{expressions}`, type annotations, method definitions, numbers with `_`, hex and binary, and every operator.
- **Completion with documentation** for every built-in function and bundled module, generated from the official reference. Members appear after `math.`, `fs.` (however you named the `require`), `hid.keyboard.` and the like; methods after `window:`, `db:` and on strings; module names inside `require("`; and your own locals, functions and parameters.
- **Hover** shows the signature and documentation of library functions and the declaration of your own variables.
- **Signature help** while typing arguments, with the current parameter highlighted.
- **Live diagnostics** from `neyuki lint` as you type: syntax errors, undefined names, `const` reassignments, type mismatches, unused variables (faded) and unreachable code.
- **Run and debug**: the run button in the editor title or <kbd>Ctrl</kbd>+<kbd>F5</kbd> runs the current file; <kbd>F5</kbd> debugs it with breakpoints, stepping, the call stack and variables, through `neyuki dap`.
- **Outline and navigation**: functions and top-level variables in the outline and breadcrumbs, methods grouped under their table, and Go to Definition for local names.
- **Snippets** for functions, loops, classes, modules, a window loop and an HTTP server, plus `-- #region` folding.

## Requirements

Diagnostics, running and debugging use the `neyuki` executable. Put it on your `PATH`, or set `neyuki.path` to its location. Highlighting, completion, hover and snippets work without it.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `neyuki.path` | `""` | Path to `neyuki`; empty uses the `PATH` |
| `neyuki.lint.enable` | `true` | Show diagnostics |
| `neyuki.lint.onType` | `true` | Check while typing, not only on open and save |
| `neyuki.lint.delay` | `300` | Milliseconds to wait after typing stops |
| `neyuki.completion.insertParentheses` | `true` | Add `()` when completing a function |

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
npm test          # grammar, analysis and extension tests
npm run api       # regenerate data/api.json from ../../neyuki/docs/reference
npm run package   # build a .vsix
```

Open this folder in VS Code and press <kbd>F5</kbd> to try the extension in a new window.

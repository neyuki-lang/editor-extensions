# Changelog

## 0.3.0

Editor features now come from the language server built into the `neyuki` executable (`neyuki lsp`). The 0.2.0 entry below removed a separate language server; this brings back the one that ships inside the binary. The extension is a thin client of it, so upgrading Neyuki upgrades the editor features without a new release of the extension. The extension notices a new `neyuki` when the window regains focus and restarts the server.

- Completion, hover, signature help, Go to Definition, outline, document highlights, folding, workspace symbols, formatting, Find All References and Rename (with preparation) come from the server.
- Diagnostics are published by the server, including faded unused code.
- Status bar item `Neyuki <version>` for Neyuki files; click it to show the server output.
- New commands: `Neyuki: Restart Language Server`, `Neyuki: Stop Language Server` and `Neyuki: Show Language Server Output`.
- The server restarts when `neyuki.path` or `neyuki.lint.enable` changes.
- A Neyuki too old to report `serverInfo` gets a one-time warning asking to upgrade.
- Completion and hover now require a Neyuki with `serverInfo` support. The offline fallback is gone: the bundled library reference (`data/api.json`) and the extension's own analysis were removed. Without a working `neyuki` executable only highlighting, snippets and folding remain.
- Removed the settings `neyuki.lint.onType` and `neyuki.lint.delay`; the server decides when to check.
- `neyuki.lint.enable` and `neyuki.completion.insertParentheses` still work, applied by the extension to what the server sends.
- Highlighting for `type Name = ...` and `export type Name = ...` declarations and for qualified type names such as `k.Options`.
- The package now includes its dependency, `vscode-languageclient`.

## 0.2.0

- Highlighting rewritten: block comments now cover every line, plus long strings with levels, interpolation, type annotations, method definitions and all operators.
- Completion, hover and signature help for the whole standard library and every bundled module, generated from the language reference.
- Live diagnostics from `neyuki lint`, with unused code faded out.
- Run File command and a `neyuki` debugger with zero-configuration F5.
- Outline, breadcrumbs and Go to Definition for local names.
- Snippets and region folding.
- The separate language server is gone; the extension has no runtime dependencies.

## 0.1.0

- Initial release with basic highlighting.

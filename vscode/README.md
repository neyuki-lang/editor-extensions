# Neyuki

Neyuki is the language used by the Neyuki compiler in this repository. This VS Code extension adds syntax highlighting and editor support for `.nyk` files.

## Features

- Syntax highlighting for Neyuki keywords, numbers, strings, comments, and operators
- `.nyk` file association with the Neyuki language
- Bracket pairing, comments, and quote auto-closing for the language
- Hover documentation for Neyuki builtins and common control-flow keywords
- Completion suggestions with inline docs for language keywords and symbols
- Language-server diagnostics for likely structural issues in Neyuki files

## Supported files

- `.nyk`

## Usage

Open a `.nyk` file in VS Code and the extension will activate automatically. Move the cursor over builtins such as `print`, `require`, `typeof`, or `if` to see hover documentation, and use IntelliSense to complete symbols and keywords while editing.

## Notes

This extension provides language tooling and syntax coloring; the compiler itself lives in the Neyuki project under the sibling `neyuki` folder.

## Development

The extension metadata lives in `package.json`, and the grammar lives in `syntaxes/neyuki.tmLanguage.json`.

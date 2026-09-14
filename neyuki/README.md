# Neyuki

Neyuki is the language used by the Neyuki compiler in this repository. This VS Code extension adds syntax highlighting and editor support for `.nyk` files.

## Features

- Syntax highlighting for Neyuki keywords, numbers, strings, comments, and operators
- `.nyk` file association with the Neyuki language
- Bracket pairing, comments, and quote auto-closing for the language

## Supported files

- `.nyk`

## Usage

Open a `.nyk` file in VS Code and the extension will activate automatically.

## Notes

This extension currently provides language tooling and syntax coloring; the compiler itself lives in the Neyuki project under the sibling `neyuki` folder.

## Development

The extension metadata lives in `package.json`, and the grammar lives in `syntaxes/neyuki.tmLanguage.json`.

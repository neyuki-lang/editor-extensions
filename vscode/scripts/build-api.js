// Builds data/api.json, the completion and hover data, from the library
// reference in the language repository (../../neyuki/docs/reference by
// default, or the directory given as the first argument).
//
// Each page is `# title`, an overview, then one `## heading` per entry:
//   ## name(param: type, other: type?): result     a function
//   ## Type:method(param: type): result            a method of an object type
//   ## name: type                                  a value

const fs = require('node:fs');
const path = require('node:path');
const { parseHeading } = require('../src/signature');

const referenceDir = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..', '..', 'neyuki', 'docs', 'reference'));
const output = path.join(__dirname, '..', 'data', 'api.json');

const libraries = [];
const entries = [];

for (const file of fs.readdirSync(referenceDir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()) {
  const text = fs.readFileSync(path.join(referenceDir, file), 'utf8').replace(/\r\n/g, '\n');
  const title = (text.match(/^# (.+)$/m) ?? [])[1] ?? file;
  const sections = text.split(/^## /m);
  const intro = sections[0].replace(/^# .+\n/, '').trim();
  const page = file.replace(/\.md$/, '');
  const module = title.startsWith('@neyuki/') ? title : page === 'globals' ? null : page;
  libraries.push({ page, title, module, doc: intro });

  for (const section of sections.slice(1)) {
    const newline = section.indexOf('\n');
    const heading = section.slice(0, newline === -1 ? undefined : newline).trim();
    const doc = newline === -1 ? '' : section.slice(newline + 1).trim();
    const parsed = parseHeading(heading);
    if (!parsed) throw new Error(`${file}: cannot read the heading "${heading}"`);
    entries.push({ ...parsed, doc, page });
  }
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ libraries, entries }, null, 1) + '\n');
console.log(`wrote ${entries.length} entries from ${libraries.length} pages to ${path.relative(process.cwd(), output)}`);

/** Validates local Markdown links without modifying documentation. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.next', '.git', 'dist']);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (/\.(md|mdx)$/i.test(entry.name)) files.push(absolute);
  }
  return files;
}

const failures = [];
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
    if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) failures.push(`${path.relative(root, file)} -> ${target}`);
  }
}

if (failures.length) {
  process.stderr.write(`Broken local documentation links (${failures.length}):\n${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Documentation links: PASS\n');
}

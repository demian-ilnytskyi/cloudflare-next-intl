import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function targets(entry) {
  if (typeof entry === 'string') return [entry];
  if (entry && typeof entry === 'object') {
    if (typeof entry.import === 'string') return [entry.import];
    return Object.values(entry).flatMap(targets);
  }
  return [];
}

const failures = [];
let checked = 0;

for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
  for (const target of targets(entry)) {
    checked++;
    const url = pathToFileURL(resolve(root, target)).href;
    try {
      await import(url);
    } catch (error) {
      failures.push({ subpath, target, code: error.code ?? 'ERROR', message: String(error.message).split('\n')[0] });
    }
  }
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}/${checked} export targets are not importable\n`);
  for (const f of failures) {
    console.error(`  ${f.subpath}\n    -> ${f.target}\n    ${f.code}: ${f.message}`);
  }
  process.exit(1);
}

console.log(`OK: all ${checked} export targets import cleanly`);

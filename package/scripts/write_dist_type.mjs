import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log('wrote dist/package.json {"type":"module"}');

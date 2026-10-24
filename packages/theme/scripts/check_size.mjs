import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const BANNED = {
  'firebase': 'core intl must never depend on firebase',
  '@firebase/auth': 'core intl must never depend on firebase auth',
  '@firebase/app': 'core intl must never depend on firebase app',
  'cloudflare-next-intl-db': 'core intl must never depend on db',
  'cloudflare-next-intl-auth': 'core intl must never depend on auth',
};

const REQUIRED_FILES = ['README.md', 'llms.txt'];

const failures = [];

for (const [name, reason] of Object.entries(BANNED)) {
  if (pkg.dependencies?.[name]) failures.push(`dependency "${name}" is banned: ${reason}`);
}
for (const file of REQUIRED_FILES) {
  if (!pkg.files?.includes(file)) failures.push(`"${file}" must stay in the "files" field`);
}

if (failures.length > 0) {
  console.error('FAIL: package size policy violated\n');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`OK: ${Object.keys(pkg.dependencies ?? {}).length} dependencies, no banned packages, README.md + llms.txt ship.`);

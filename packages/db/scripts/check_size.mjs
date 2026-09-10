import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// See ../../.agent/.sub-rules/packages/package-authoring.md — add an entry
// here whenever a dependency is swapped for a lighter equivalent that must
// never silently reappear.
const BANNED = {
  'embedded-postgres': 'ships per-platform Postgres binaries (30MB+); only the extracted cloudflare-next-intl-db-codegen CLI package needs it, never this runtime package',
  'drizzle-kit': 'only the codegen CLI needs live-introspection; moved to cloudflare-next-intl-db-codegen',
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

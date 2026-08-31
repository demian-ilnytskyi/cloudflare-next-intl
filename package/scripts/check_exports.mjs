import { existsSync, readFileSync } from 'node:fs';
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

/**
 * Two classes of import failure are expected here and NOT real breakage,
 * because plain `node --experimental` `import()` (no bundler) can never
 * satisfy them the way a real consumer's build does:
 *
 * - `@intl-config`: an intentional virtual alias every consuming app must
 *   point at its own `RoutingConfig` file via tsconfig paths / bundler
 *   alias (see `src/config/intl_config.ts` and the README "Setup" step 2)
 *   — it is never a real, installable module, so it can never resolve
 *   outside a consumer's own aliased build.
 *
 * Anything else — a missing dist file, a broken relative import, a syntax
 * error — still fails the check below.
 */
function isExpectedConsumerContextFailure(error) {
  const message = String(error.message ?? '');
  if (error.code === 'ERR_INVALID_MODULE_SPECIFIER' && message.includes('@intl-config')) return true;
  return false;
}

const failures = [];
const skipped = [];
let checked = 0;

for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
  for (const target of targets(entry)) {
    checked++;
    const file = resolve(root, target);
    if (!existsSync(file)) {
      failures.push({ subpath, target, code: 'ENOENT', message: 'dist file does not exist — did the build run?' });
      continue;
    }
    const url = pathToFileURL(file).href;
    try {
      await import(url);
    } catch (error) {
      const record = { subpath, target, code: error.code ?? 'ERROR', message: String(error.message).split('\n')[0] };
      if (isExpectedConsumerContextFailure(error)) skipped.push(record);
      else failures.push(record);
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

console.log(
  `OK: ${checked - skipped.length}/${checked} export targets import cleanly` +
    (skipped.length > 0 ? ` (${skipped.length} skipped — require a consumer app's bundler/alias, see script comment)` : ''),
);

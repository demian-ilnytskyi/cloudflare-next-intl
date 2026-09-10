#!/usr/bin/env node
// Re-exec shim: `cfni-db-codegen` now lives in cloudflare-next-intl-db-codegen,
// installed as this package's dependency. Kept here so existing consumers'
// `npx cfni-db-codegen` invocations keep working with no changes needed.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// cloudflare-next-intl-db-codegen declares no "exports" map, so its
// package.json (and therefore its package root) resolves directly —
// unlike the runtime db package, this one isn't trying to restrict its
// public surface to a curated set of subpaths.
const pkgPath = createRequire(import.meta.url).resolve('cloudflare-next-intl-db-codegen/package.json');
const codegenPackageRoot = dirname(fileURLToPath(pathToFileURL(pkgPath)));
await import(pathToFileURL(join(codegenPackageRoot, 'bin', 'db_codegen.mjs')).href);

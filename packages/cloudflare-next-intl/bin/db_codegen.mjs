#!/usr/bin/env node
// Re-exec shim: `cfni-db-codegen` now lives in @cloudflare-next-intl/db,
// installed as this package's dependency. Kept here so existing consumers'
// `npx cfni-db-codegen` invocations keep working with no changes needed.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve via the package's root export (".") — its exports map doesn't
// declare "./package.json", so that can't be resolved directly. The root
// export ("dist/src/index.js") sits two directories below the package root.
const indexPath = fileURLToPath(import.meta.resolve('@cloudflare-next-intl/db'));
const dbPackageRoot = join(dirname(indexPath), '..', '..');
await import(pathToFileURL(join(dbPackageRoot, 'bin', 'db_codegen.mjs')).href);

#!/usr/bin/env node
// Regenerates Drizzle models by introspecting a live Postgres with drizzle-kit.
// Usage: cfni-db-codegen [--check] [--ddl-dir=…] [--out-dir=…] [--out-file=…] [--db-url=…] [--drizzle-config=…]
//
// Needs a reachable Postgres to introspect — any Postgres, not specifically
// a Docker one. Set CODEGEN_DATABASE_URL to point at whichever you have:
// local Supabase (./supabase/scripts/db_start.sh --reset, needs Docker), a
// native Postgres install, or a remote/staging database. With no env var
// set, it tries the local Supabase default (127.0.0.1:54322).
// CODEGEN_CONNECT_TIMEOUT_MS overrides the 5s default reachability-check
// timeout — raise it for a slow/cold-starting remote or serverless target.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Client } from 'pg';
import resolveCodegenPaths from '../dist/src/db/codegen_paths.js';

const paths = resolveCodegenPaths(process.argv.slice(2), process.env, process.cwd());

async function assertReachable(url) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: paths.timeoutMs });
    try {
        await client.connect();
        await client.end();
    } catch (error) {
        await client.end().catch(() => { /* already failed to connect */ });
        console.error(`❌ Could not reach Postgres at ${url}\n   (${error.message})`);
        console.error("\n   drizzle-kit pull needs a live Postgres to introspect — any one works, this script has no Docker dependency of its own. Pick one:");
        console.error("   - Local Supabase (needs Docker running):  ./supabase/scripts/db_start.sh --reset");
        console.error("   - A native Postgres you already have:     CODEGEN_DATABASE_URL=postgresql://... npm run db:codegen");
        console.error("   - A remote/staging database:              CODEGEN_DATABASE_URL=postgresql://... npm run db:codegen");
        console.error(`   Slow/cold-starting target? Raise the timeout: CODEGEN_CONNECT_TIMEOUT_MS=15000 npm run db:codegen`);
        process.exit(1);
    }
}

function sqlFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sqlFiles(path);
        return entry.name.endsWith(".sql") || entry.name.endsWith(".txt") ? [path] : [];
    }).sort();
}

function ddlHash() {
    const hash = createHash("sha256");
    for (const file of sqlFiles(paths.ddlDir)) {
        hash.update(relative(process.cwd(), file));
        hash.update(readFileSync(file));
    }
    return hash.digest("hex");
}

const hash = ddlHash();

if (paths.check) {
    const previous = existsSync(paths.manifest) ? JSON.parse(readFileSync(paths.manifest, "utf8")).ddlHash : null;
    if (previous !== hash) {
        console.error(`❌ ${relative(process.cwd(), paths.ddlDir)} changed without regenerating models. Run: npm run db:codegen`);
        process.exit(1);
    }
    console.log(`✅ Drizzle models are in sync with ${relative(process.cwd(), paths.ddlDir)}`);
    process.exit(0);
}

await assertReachable(paths.dbUrl);

rmSync(paths.pullDir, { recursive: true, force: true });
execFileSync('npx', ['drizzle-kit', 'pull', ...(paths.drizzleConfig ? [`--config=${paths.drizzleConfig}`] : [])], { stdio: 'inherit' });

mkdirSync(paths.outDir, { recursive: true });
const pulled = join(paths.pullDir, "schema.ts");
if (!existsSync(pulled)) {
    console.error(`❌ drizzle-kit pull produced no schema at ${pulled}`);
    process.exit(1);
}
// Known drizzle-kit 0.31.10 introspection limitation: a column default that
// is a call to a user-defined Postgres function (e.g. `default
// public.current_user_id()`) is emitted as a bare, unimported JS identifier
// call — e.g. `.default(current_user_id())` — instead of being wrapped as a
// raw SQL expression (`.default(sql\`public.current_user_id()\`)`) the way
// other non-literal defaults in the same file correctly are (see `sql\`'1000'\``,
// `sql\`CURRENT_DATE\`` elsewhere in the pulled output). Confirmed via
// drizzle-kit's own introspection source (node_modules/drizzle-kit/api.js):
// the Postgres column-default normalizer only flags a default as an
// expression (`isDefaultAnExpression`) for numeric columns; for
// text/varchar/uuid columns a non-quoted, non-numeric default string is
// returned verbatim with no such flag, so the codegen path that decides
// whether to wrap in sql`` never sees it. There is no newer drizzle-kit
// release (0.31.10 is already `latest`) and no pull/config flag that
// changes this. `now()` and `gen_random_uuid()` don't hit this because
// drizzle-kit special-cases those into `.defaultNow()` / `.defaultRandom()`;
// any other bare `identifier()` call default does not get that treatment.
// This patch detects that specific shape and rewrites it into the correct
// sql`` form so the generated file is importable without throwing
// `ReferenceError: <fn> is not defined`.
function patchBareFunctionCallDefaults(source) {
    return source.replace(
        /\.default\((?!sql`)([a-zA-Z_][a-zA-Z0-9_]*)\(\)\)/g,
        (match, fnName) => `.default(sql\`public.${fnName}()\`)`,
    );
}

const banner = `// GENERATED by cfni-db-codegen from ${relative(process.cwd(), paths.ddlDir)} — do not edit.\n`;
const pulledSource = patchBareFunctionCallDefaults(readFileSync(pulled, "utf8"));
writeFileSync(paths.outFile, banner + pulledSource);
rmSync(paths.pullDir, { recursive: true, force: true });
writeFileSync(paths.manifest, `${JSON.stringify({ ddlHash: hash }, null, 2)}\n`);
console.log(`✅ Generated ${relative(process.cwd(), paths.outFile)}`);

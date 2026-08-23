#!/usr/bin/env node
// Regenerates Drizzle models by introspecting a live Postgres with drizzle-kit.
// Usage: cfni-db-codegen [--check] [--ddl-dir=…] [--out-dir=…] [--out-file=…] [--db-url=…] [--drizzle-config=…]
//                        [--rpc-dir=…] [--rpc-file-name=…] [--tests-dir=…] [--tests-file-name=…] [--force] [--skip-exec]
//
// --rpc-file-name/--tests-file-name (also CFNI_DB_RPC_FILE_NAME/
// CFNI_DB_TESTS_FILE_NAME) rename the installed cfni_exec.sql/its pgTAP test
// file in the consuming project — e.g. if a project prefers a name that
// reflects the file now ships both `cfni_exec` and `cfni_exec_batch`. Default
// to `cfni_exec.sql` for both, unchanged from before.
//
// --out-dir may be repeated, or given a comma-separated list, to generate the
// same schema into several projects at once (CFNI_DB_OUT_DIR accepts a
// comma-separated list too).
//
// Needs a reachable Postgres to introspect — any Postgres, not specifically
// a Docker one. Set CODEGEN_DATABASE_URL to point at whichever you have:
// local Supabase (./supabase/scripts/db_start.sh --reset, needs Docker), a
// native Postgres install, or a remote/staging database. With no env var
// set, it tries the local Supabase default (127.0.0.1:54322).
// CODEGEN_CONNECT_TIMEOUT_MS overrides the 5s default reachability-check
// timeout — raise it for a slow/cold-starting remote or serverless target.
//
// After a successful (non-`--check`) run, also installs `cfni_exec.sql` (and
// its pgTAP test file) into `--rpc-dir`/`--tests-dir` (default siblings of
// `--ddl-dir`, e.g. `supabase/rpc`/`supabase/tests`) — but only when the
// project's `db.supabase.rawSql` isn't explicitly `false` (read from
// `next.config.*`'s `@intl-config` alias; a warning is printed if it can't
// be determined). An existing, differing file is left alone unless
// `--force`/CFNI_DB_FORCE_EXEC=true is set. Pass `--skip-exec`/
// CFNI_DB_SKIP_EXEC=true to turn this step off entirely, or use the
// standalone `cfni-db-install-exec` command to run only this step.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Client } from 'pg';
import resolveCodegenPaths from '../dist/src/db/codegen_paths.js';
import { runInstallExecStep } from './install_exec_step.mjs';
import { startEphemeralPostgres } from './ephemeral_pg.mjs';
import { orderedSqlFiles } from './ddl_order.mjs';

const paths = resolveCodegenPaths(process.argv.slice(2), process.env, process.cwd());

async function isReachable(url) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: paths.timeoutMs });
    try {
        await client.connect();
        await client.end();
        return true;
    } catch {
        await client.end().catch(() => { /* already failed to connect */ });
        return false;
    }
}

function failUnreachable(url) {
    console.error(`❌ Could not reach Postgres at ${url}`);
    console.error("\n   drizzle-kit pull needs a live Postgres to introspect — any one works, this script has no Docker dependency of its own. Pick one:");
    console.error("   - Local Supabase (needs Docker running):  ./supabase/scripts/db_start.sh --reset");
    console.error("   - A native Postgres you already have:     CODEGEN_DATABASE_URL=postgresql://... npm run db:codegen");
    console.error("   - A remote/staging database:              CODEGEN_DATABASE_URL=postgresql://... npm run db:codegen");
    console.error("   - Zero setup (no Docker/Postgres at all):  npm install --save-dev embedded-postgres  (auto-used as a fallback)");
    console.error(`   Slow/cold-starting target? Raise the timeout: CODEGEN_CONNECT_TIMEOUT_MS=15000 npm run db:codegen`);
    process.exit(1);
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
    for (const target of paths.targets) {
        const previous = existsSync(target.manifest) ? JSON.parse(readFileSync(target.manifest, "utf8")).ddlHash : null;
        if (previous === hash) continue;
        console.error(`❌ ${relative(process.cwd(), paths.ddlDir)} changed without regenerating models in ${relative(process.cwd(), target.outDir)}. Run: npm run db:codegen`);
        process.exit(1);
    }
    console.log(`✅ Drizzle models are in sync with ${relative(process.cwd(), paths.ddlDir)}`);
    process.exit(0);
}

let effectiveDbUrl = paths.dbUrl;
let ephemeral = null;
try {
    if (!(await isReachable(paths.dbUrl))) {
        if (paths.dbUrlExplicit) failUnreachable(paths.dbUrl);
        ephemeral = await startEphemeralPostgres(orderedSqlFiles(paths.ddlDir));
        if (!ephemeral) failUnreachable(paths.dbUrl);
        effectiveDbUrl = ephemeral.url;
    }

    rmSync(paths.pullDir, { recursive: true, force: true });
    execFileSync('npx', ['drizzle-kit', 'pull', ...(paths.drizzleConfig ? [`--config=${paths.drizzleConfig}`] : [])], {
        stdio: 'inherit',
        env: { ...process.env, CODEGEN_DATABASE_URL: effectiveDbUrl },
    });
} finally {
    if (ephemeral) await ephemeral.stop();
}

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

// drizzle-kit emits imports from `drizzle-orm/pg-core` and `drizzle-orm`.
// Point them at this package's re-exports so consuming projects don't need a
// direct `drizzle-orm` dependency just to load their generated schema.
function retargetDrizzleImports(source) {
    const coreMatch = source.match(
        /^import \{([^}]*)\} from "drizzle-orm\/pg-core";?$/m,
    );
    const rootMatch = source.match(/^import \{([^}]*)\} from "drizzle-orm";?$/m);
    if (!coreMatch && !rootMatch) return source;

    const names = [...(coreMatch ? [coreMatch[1]] : []), ...(rootMatch ? [rootMatch[1]] : [])]
        .flatMap((group) => group.split(","))
        .map((name) => name.trim())
        .filter(Boolean);
    const merged = `import { ${[...new Set(names)].join(", ")} } from "cloudflare-next-intl/dbSchema"`;

    let seen = false;
    return source.replace(
        /^import \{[^}]*\} from "drizzle-orm(?:\/pg-core)?";?$/gm,
        () => {
            if (seen) return "";
            seen = true;
            return merged;
        },
    ).replace(/\n{3,}/g, "\n\n");
}

const banner = `// GENERATED by cfni-db-codegen from ${relative(process.cwd(), paths.ddlDir)} — do not edit.\n`;
const pulledSource = retargetDrizzleImports(
    patchBareFunctionCallDefaults(readFileSync(pulled, "utf8")),
);
rmSync(paths.pullDir, { recursive: true, force: true });
for (const target of paths.targets) {
    mkdirSync(target.outDir, { recursive: true });
    writeFileSync(target.outFile, banner + pulledSource);
    writeFileSync(target.manifest, `${JSON.stringify({ ddlHash: hash }, null, 2)}\n`);
    console.log(`✅ Generated ${relative(process.cwd(), target.outFile)}`);
}

runInstallExecStep(paths, process.cwd());

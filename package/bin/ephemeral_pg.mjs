// Spins up a throwaway, local-only Postgres (via `embedded-postgres`, a
// prebuilt binary — no Docker) so `cfni-db-codegen` can introspect DDL
// without any live Postgres already running. Used only as a fallback when
// no --db-url/CODEGEN_DATABASE_URL was given and nothing is reachable at the
// local Supabase default.
import { readFileSync, rmSync } from 'node:fs';
import { Client } from 'pg';

const EPHEMERAL_PORT = 54329;
const EPHEMERAL_URL = `postgresql://postgres:postgres@127.0.0.1:${EPHEMERAL_PORT}/postgres`;

/** Starts an ephemeral Postgres, loads every file in `sqlFiles` into it, and
 *  returns { url, stop() }. Caller must call stop() when done, even on error. */
export async function startEphemeralPostgres(dataDir, sqlFiles) {
    let EmbeddedPostgres;
    try {
        ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
    } catch {
        return null; // optional dep not installed — caller falls back to its normal error message
    }

    rmSync(dataDir, { recursive: true, force: true });
    const pg = new EmbeddedPostgres({
        databaseDir: dataDir,
        port: EPHEMERAL_PORT,
        user: 'postgres',
        password: 'postgres',
        persistent: false,
    });

    console.log('ℹ️  No reachable Postgres found — starting an ephemeral one (embedded-postgres, no Docker needed)…');
    await pg.initialise();
    await pg.start();

    const client = new Client({ connectionString: EPHEMERAL_URL });
    await client.connect();
    try {
        for (const file of sqlFiles) {
            const sql = readFileSync(file, 'utf8');
            if (sql.trim().length === 0) continue;
            await client.query(sql);
        }
    } finally {
        await client.end();
    }

    return {
        url: EPHEMERAL_URL,
        async stop() {
            await pg.stop().catch(() => { /* best-effort */ });
            rmSync(dataDir, { recursive: true, force: true });
        },
    };
}

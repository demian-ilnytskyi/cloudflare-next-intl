// Spins up a throwaway, local-only Postgres (via `embedded-postgres`, a
// prebuilt binary — no Docker) so `cfni-db-codegen` can introspect DDL
// without any live Postgres already running. Used only as a fallback when
// no --db-url/CODEGEN_DATABASE_URL was given and nothing is reachable at the
// local Supabase default.
import { readFileSync, rmSync } from 'node:fs';
import { relative } from 'node:path';
import { Client } from 'pg';

const EPHEMERAL_PORT = 54329;
const EPHEMERAL_URL = `postgresql://postgres:postgres@127.0.0.1:${EPHEMERAL_PORT}/postgres`;
// Lives under this package's own install dir, not the consuming project —
// keeps a throwaway Postgres data directory out of the user's repo/tree.
const DATA_DIR = new URL('../.drizzle-ephemeral-pg', import.meta.url).pathname;

// A plain embedded-postgres cluster has none of the roles the real Supabase
// Postgres image bootstraps into every project (`anon`/`authenticated`/
// `service_role` for PostgREST, plus the admin roles some GRANT/ALTER
// statements target) — DDL that GRANTs to them fails otherwise. These are
// the standard local-dev role names Supabase itself creates; DDL never
// creates them, so codegen must.
const SUPABASE_ROLES = [
    'anon', 'authenticated', 'service_role', 'authenticator',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_realtime_admin',
];

/** Starts an ephemeral Postgres, loads every file in `sqlFiles` into it, and
 *  returns { url, stop() }. Caller must call stop() when done, even on error. */
export async function startEphemeralPostgres(sqlFiles) {
    const dataDir = DATA_DIR;
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
    try {
        await pg.initialise();
        await pg.start();

        const client = new Client({ connectionString: EPHEMERAL_URL });
        await client.connect();
        try {
            for (const role of SUPABASE_ROLES) {
                await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT;`);
            }
            for (const file of sqlFiles) {
                const sql = readFileSync(file, 'utf8');
                if (sql.trim().length === 0) continue;
                try {
                    await client.query(sql);
                } catch (error) {
                    error.message = `${relative(process.cwd(), file)}: ${error.message}`;
                    throw error;
                }
            }
        } finally {
            await client.end();
        }
    } catch (error) {
        await pg.stop().catch(() => { /* best-effort */ });
        rmSync(dataDir, { recursive: true, force: true });
        throw error;
    }

    return {
        url: EPHEMERAL_URL,
        async stop() {
            await pg.stop().catch(() => { /* best-effort */ });
            rmSync(dataDir, { recursive: true, force: true });
        },
    };
}

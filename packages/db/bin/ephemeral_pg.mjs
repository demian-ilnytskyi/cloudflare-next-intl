// Spins up a throwaway, local-only Postgres (via `embedded-postgres`, a
// prebuilt binary — no Docker) so `cfni-db-codegen` can introspect DDL
// without any external live Postgres running.
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

    console.log('ℹ️  Using embedded-postgres (zero setup, no Docker) to introspect DDL…');
    try {
        await pg.initialise();
        await pg.start();

        const client = new Client({ connectionString: EPHEMERAL_URL });
        await client.connect();
        try {
            for (const role of SUPABASE_ROLES) {
                await client.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT;`).catch(() => {});
            }
            await client.query(`CREATE SCHEMA IF NOT EXISTS auth;`).catch(() => {});
            await client.query(`CREATE SCHEMA IF NOT EXISTS storage;`).catch(() => {});
            await client.query(`CREATE SCHEMA IF NOT EXISTS extensions;`).catch(() => {});
            await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`).catch(() => {});
            await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`).catch(() => {});

            // Bootstrap common Supabase helper functions and tables for DDL compatibility
            await client.query(`
                CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid $$;
                CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
                CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'anon'::text $$;
                CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT ''::text $$;

                CREATE TABLE IF NOT EXISTS auth.users (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    email text,
                    created_at timestamptz DEFAULT now(),
                    updated_at timestamptz DEFAULT now(),
                    raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
                    raw_app_meta_data jsonb DEFAULT '{}'::jsonb
                );

                CREATE TABLE IF NOT EXISTS storage.buckets (
                    id text PRIMARY KEY,
                    name text NOT NULL,
                    owner uuid,
                    created_at timestamptz DEFAULT now(),
                    updated_at timestamptz DEFAULT now(),
                    public boolean DEFAULT false,
                    avif_autodetection boolean DEFAULT false,
                    file_size_limit bigint,
                    allowed_mime_types text[],
                    owner_id text
                );

                CREATE TABLE IF NOT EXISTS storage.objects (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    bucket_id text REFERENCES storage.buckets(id),
                    name text,
                    owner uuid,
                    created_at timestamptz DEFAULT now(),
                    updated_at timestamptz DEFAULT now(),
                    last_accessed_at timestamptz DEFAULT now(),
                    metadata jsonb,
                    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
                    version text,
                    owner_id text
                );

                CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$
                BEGIN
                    RETURN string_to_array(name, '/');
                END
                $$;

                CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE plpgsql AS $$
                DECLARE
                    parts text[];
                BEGIN
                    parts := string_to_array(name, '/');
                    RETURN parts[array_length(parts, 1)];
                END
                $$;

                CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE plpgsql AS $$
                DECLARE
                    parts text[];
                    filename text;
                    ext_parts text[];
                BEGIN
                    parts := string_to_array(name, '/');
                    filename := parts[array_length(parts, 1)];
                    ext_parts := string_to_array(filename, '.');
                    IF array_length(ext_parts, 1) > 1 THEN
                        RETURN ext_parts[array_length(ext_parts, 1)];
                    ELSE
                        RETURN '';
                    END IF;
                END
                $$;
            `).catch(() => {});

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

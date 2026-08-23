import type { DbRoutingConfig } from '../types/types';

/** Which transport the `db` exports use for a given config. */
export type DbMode = 'postgres' | 'supabase';

/**
 * Decides how to reach the database from the shape of the `db` config.
 *
 * Direct Postgres wins whenever it is configured, so adding a `supabase`
 * block to an existing config never silently reroutes live traffic. With
 * neither set the result is still `'postgres'`, which lets
 * `connectToPostgres` raise its existing, more specific error about the
 * missing connection string.
 *
 * @param db The `db` field off your routing config.
 * @returns `'postgres'` for direct connection-string access, `'supabase'`
 * for PostgREST access.
 */
export default function resolveDbMode(db: DbRoutingConfig): DbMode {
    if (db.connectionString) return 'postgres';
    return db.supabase ? 'supabase' : 'postgres';
}

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
export default function resolveDbMode(db) {
    if (db.connectionString)
        return 'postgres';
    return db.supabase ? 'supabase' : 'postgres';
}

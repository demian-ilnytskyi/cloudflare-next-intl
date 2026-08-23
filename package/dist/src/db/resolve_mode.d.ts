import type { DbRoutingConfig, SupabaseDbConfig } from '../types/types';
/** Which transport the `db` exports use for a given config. */
export type DbMode = 'postgres' | 'supabase';
/**
 * The resolved transport for a `db` config, carrying whatever
 * {@link resolveDbMode} already resolved to decide it — so a caller that
 * picks `'postgres'` already has the connection string in hand and never
 * needs to call a function-based `db.connectionString` a second time.
 */
export type ResolvedDbMode = {
    mode: 'postgres';
    connectionString: string | undefined;
} | {
    mode: 'supabase';
    supabase: SupabaseDbConfig;
};
/**
 * Decides how to reach the database from the shape of the `db` config.
 *
 * Direct Postgres wins whenever it resolves to a real connection string, so
 * adding a `supabase` block to an existing config never silently reroutes
 * live traffic. `connectionString` given as a function is actually called
 * (and awaited) here — not just checked for presence — so a resolver that
 * comes back `null`/`undefined` (its own source having nothing right now)
 * falls through to `supabase` instead of locking in `'postgres'` mode and
 * failing later in `connectToPostgres` with no `supabase` fallback tried.
 * With neither resolving to anything, the result is still `'postgres'`
 * (with an `undefined` connection string), which lets `connectToPostgres`
 * raise its existing, more specific error about the missing connection
 * string — it is never asked to resolve `db.connectionString` itself, so a
 * resolver given as a function runs exactly once per call here, not twice.
 *
 * @param db The `db` field off your routing config.
 * @returns The resolved mode, plus whichever of `connectionString`/`supabase`
 * that mode needs.
 */
export default function resolveDbMode(db: DbRoutingConfig): Promise<ResolvedDbMode>;

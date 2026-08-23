/**
 * Asserts that the optional `db` config is present, narrowing it from
 * `DbRoutingConfig | undefined` to `DbRoutingConfig` for the rest of the
 * caller's scope.
 *
 * Every `db` export calls this before touching `pg`/`drizzle-orm`. It throws
 * rather than silently no-op'ing, so a consumer who calls e.g. `withPublicDb()`
 * without setting `db` on their `RoutingConfig` gets an immediate, actionable
 * error instead of a confusing failed query.
 *
 * @param db The `db` field off your routing config.
 * @throws If `db` is undefined.
 */
export default function requireDbConfig(db) {
    if (!db) {
        throw new Error('db: `db` is not set on your RoutingConfig. Add a `db` object ' +
            '(connectionString or supabase) to the config passed to ' +
            '`setIntlConfig` before using any db export.');
    }
}

/**
 * Every `db` export calls this before touching `pg`/`drizzle-orm`. Throws
 * instead of silently no-op'ing so a consumer who calls e.g.
 * `withPublicContext()` without setting `db` on their `RoutingConfig` gets an
 * immediate, actionable error rather than a failed query.
 */
export default function requireDbConfig(db) {
    if (!db) {
        throw new Error('db: `db` is not set on your RoutingConfig. Add a `db` object ' +
            '(connectionString or hyperdriveBinding) to the config passed to ' +
            '`setIntlConfig` before using any db export.');
    }
}

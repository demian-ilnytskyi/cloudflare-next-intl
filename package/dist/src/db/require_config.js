export default function requireDbConfig(db) {
    if (!db) {
        throw new Error('db: `db` is not set on your RoutingConfig. Add a `db` object ' +
            '(connectionString or supabase) to the config passed to ' +
            '`setIntlConfig` before using any db export.');
    }
}

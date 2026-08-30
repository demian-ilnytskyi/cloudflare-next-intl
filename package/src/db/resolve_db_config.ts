import type { DbRoutingConfig } from '../types/types.js';
import type { DbConfig } from './connection.js';

/**
 * Resolves the config `withPublicDb`/`withUserDb` run against. `dbOverride`
 * (a `db` block passed directly to the call) always wins over `@intl-config`
 * for connection info, letting a plain TypeScript project (Firebase
 * Functions, scripts, anything without Next.js) supply `connectionString`/
 * `supabase` per call with no `@intl-config` alias set up at all.
 *
 * When `@intl-config` *is* set (a Next.js app), its `firebaseAuth`/`generate`/
 * `errorHandling` still apply underneath the override — only the `db` block
 * itself is replaced — so an override never has to duplicate those.
 */
export default async function resolveDbConfig(dbOverride?: DbRoutingConfig): Promise<DbConfig> {
    let base: DbConfig = {};
    try {
        base = (await import('../config/intl_config.js')).default;
    } catch {
        // `@intl-config` alias not set — fine as long as `dbOverride` is given.
    }

    if (!dbOverride) return base;
    return { ...base, db: dbOverride };
}

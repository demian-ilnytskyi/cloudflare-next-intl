import type { DbRoutingConfig, DbConfig } from 'cloudflare-next-intl-db';
import type { RoutingConfig, Locales, LocalePrefixMode } from '../types/types.js';

function buildAuthUserResolver(config: RoutingConfig<Locales, LocalePrefixMode>): DbConfig['resolveAuthUser'] {
    if (!config.firebaseAuth) return undefined;
    return async () => {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (!user) return null;
        return {
            uid: user.uid,
            getIdToken: (forceRefresh) => user.getIdToken(forceRefresh),
            getIdTokenResult: () => user.getIdTokenResult(),
        };
    };
}

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
    let base: RoutingConfig<Locales, LocalePrefixMode> = { locales: [], defaultLocale: '' };
    try {
        base = (await import('../config/intl_config.js')).default;
    } catch {
        // `@intl-config` alias not set — fine as long as `dbOverride` is given.
    }

    const db = dbOverride ?? base.db;
    return {
        db,
        generate: base.generate,
        errorHandling: base.errorHandling,
        resolveAuthUser: buildAuthUserResolver(base),
    };
}

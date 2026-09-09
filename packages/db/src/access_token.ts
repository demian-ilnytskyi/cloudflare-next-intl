import type { DbConfig } from './types.js';
import requireDbConfig from './require_config.js';

/**
 * Resolves the JWT that identifies the caller to Supabase, trying
 * `db.getAccessToken()` first, then `config.resolveAuthUser()` (the
 * caller's own auth-system hook — the main `cloudflare-next-intl` package
 * wires this to Firebase Auth automatically; a standalone caller supplies
 * its own or omits it).
 *
 * PostgREST reads this token to pick the caller's role and populate
 * `request.jwt.claims`, which is what makes RLS behave the same as it does
 * in connection-string mode.
 *
 * @param config Your db config; `config.db` must be set.
 * @returns The bearer token to send with the request.
 * @throws If `db` is not set, or no token can be resolved.
 */
export default async function resolveAccessToken(config: DbConfig): Promise<string> {
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getAccessToken?.();
    if (fromConfig) return fromConfig;
    if (config.resolveAuthUser) {
        const authUser = await config.resolveAuthUser();
        const token = await authUser?.getIdToken(false);
        if (token) return token;
    }
    throw new Error(
        'db: withUserDb could not resolve an access token for Supabase. Set ' +
        '`db.getAccessToken`, or `config.resolveAuthUser` so a signed-in ' +
        "user's token is used.",
    );
}

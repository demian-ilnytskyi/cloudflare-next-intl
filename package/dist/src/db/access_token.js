import requireDbConfig from './require_config';
/**
 * Resolves the JWT that identifies the caller to Supabase, trying
 * `db.getAccessToken()` first, then the signed-in Firebase user's ID token.
 *
 * PostgREST reads this token to pick the caller's role and populate
 * `request.jwt.claims`, which is what makes RLS behave the same as it does in
 * connection-string mode.
 *
 * @param config Your routing config; `config.db` must be set.
 * @returns The bearer token to send with the request.
 * @throws If `db` is not set, or no token can be resolved.
 */
export default async function resolveAccessToken(config) {
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getAccessToken?.();
    if (fromConfig)
        return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server');
        const { user } = await getAuthUser();
        const token = await user?.getIdToken(false);
        if (token)
            return token;
    }
    throw new Error('db: withUserDb could not resolve an access token for Supabase. Set ' +
        '`db.getAccessToken`, or configure `firebaseAuth` so the signed-in ' +
        'user\'s Firebase ID token is used.');
}

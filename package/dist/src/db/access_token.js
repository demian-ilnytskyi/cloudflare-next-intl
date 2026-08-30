import requireDbConfig from './require_config.js';
export default async function resolveAccessToken(config) {
    const db = config.db;
    requireDbConfig(db);
    const fromConfig = await db.getAccessToken?.();
    if (fromConfig)
        return fromConfig;
    if (config.firebaseAuth) {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        const token = await user?.getIdToken(false);
        if (token)
            return token;
    }
    throw new Error('db: withUserDb could not resolve an access token for Supabase. Set ' +
        '`db.getAccessToken`, or configure `firebaseAuth` so the signed-in ' +
        'user\'s Firebase ID token is used.');
}

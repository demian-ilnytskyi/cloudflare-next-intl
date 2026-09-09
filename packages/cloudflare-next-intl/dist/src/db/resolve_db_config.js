function buildAuthUserResolver(config) {
    if (!config.firebaseAuth)
        return undefined;
    return async () => {
        const { getAuthUser } = await import('../firebase_auth/server/use_auth_user_server.js');
        const { user } = await getAuthUser();
        if (!user)
            return null;
        return {
            uid: user.uid,
            getIdToken: (forceRefresh) => user.getIdToken(forceRefresh),
            getIdTokenResult: () => user.getIdTokenResult(),
        };
    };
}
export default async function resolveDbConfig(dbOverride) {
    let base = { locales: [], defaultLocale: '' };
    try {
        base = (await import('../config/intl_config.js')).default;
    }
    catch {
    }
    const db = dbOverride ?? base.db;
    return {
        db,
        generate: base.generate,
        errorHandling: base.errorHandling,
        resolveAuthUser: buildAuthUserResolver(base),
    };
}

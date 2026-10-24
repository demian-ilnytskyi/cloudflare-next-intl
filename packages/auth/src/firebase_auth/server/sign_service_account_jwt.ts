import type { FirebaseAppCheckConfig } from '../../types.js';
import signCustomTokenRemote from './sign_custom_token_remote.js';

/**
 * Signs a JWT using service account credentials (local privateKey or remote OAuth).
 * Throws when credentials are missing.
 */
export default async function signServiceAccountJwt(
    appCheck: FirebaseAppCheckConfig,
    claims: Record<string, unknown>,
): Promise<string> {
    if (!appCheck || !appCheck.clientEmail) {
        throw new Error('Missing clientEmail for service account signing');
    }
    const hasOauthTriple = Boolean(appCheck.oauthClientId && appCheck.oauthClientSecret && appCheck.oauthRefreshToken);
    if (!appCheck.privateKey && !hasOauthTriple) {
        throw new Error('Missing privateKey or OAuth credentials for service account signing');
    }

    if (appCheck.privateKey) {
        const { SignJWT, importPKCS8 } = await import('jose');
        const privateKey = await importPKCS8(appCheck.privateKey.replace(/\\n/g, '\n'), 'RS256');
        const { iss, sub, aud, iat, exp, ...payload } = claims;
        let jwt = new SignJWT(payload).setProtectedHeader({ alg: 'RS256', typ: 'JWT' });
        if (typeof iss === 'string') jwt = jwt.setIssuer(iss);
        if (typeof sub === 'string') jwt = jwt.setSubject(sub);
        if (typeof aud === 'string') jwt = jwt.setAudience(aud);
        if (typeof iat === 'number') jwt = jwt.setIssuedAt(iat);
        else jwt = jwt.setIssuedAt();
        if (typeof exp === 'number' || typeof exp === 'string') jwt = jwt.setExpirationTime(exp);
        return jwt.sign(privateKey);
    }

    return signCustomTokenRemote(appCheck.clientEmail, claims, {
        clientId: appCheck.oauthClientId!,
        clientSecret: appCheck.oauthClientSecret!,
        refreshToken: appCheck.oauthRefreshToken!,
    });
}

import config from '@intl-config';
import reportError from '../../error_handling/report_error';
const APP_CHECK_CUSTOM_TOKEN_AUDIENCE = 'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.FirebaseAppCheck';
const DEFAULT_CUSTOM_TOKEN_LIFETIME = '1h';
/**
 * Mints a fresh App Check token server-side via a service account, for use
 * when the client-written App Check cookie (see `appCheckTokenCookieName`)
 * is absent — e.g. a cold navigation before `AuthUserProvider` has run and
 * had a chance to write it. Requires `clientEmail`/`privateKey`/`appId` on
 * `firebaseAuth.appCheck`; returns `undefined` (never throws) if any of
 * those are missing or the exchange fails, so a caller can always fall back
 * to "no App Check token" exactly as before this existed.
 *
 * Signs a short-lived custom JWT with the service account's private key
 * (`jose`, Edge/WebCrypto-compatible — no `firebase-admin`), then exchanges
 * it for an App Check token via `exchangeCustomToken`. Not cached beyond the
 * caller's own request-scoped `cache()` wrapper — a fresh mint costs one
 * signing operation plus one network round-trip, acceptable per-request but
 * not worth doing more than once per request.
 */
export default async function mintServerAppCheckToken(projectId, appCheck) {
    if (!appCheck?.clientEmail || !appCheck.privateKey || !appCheck.appId)
        return undefined;
    try {
        const { SignJWT, importPKCS8 } = await import('jose');
        const privateKey = await importPKCS8(appCheck.privateKey.replace(/\\n/g, '\n'), 'RS256');
        const customToken = await new SignJWT({ app_id: appCheck.appId })
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            .setIssuer(appCheck.clientEmail)
            .setSubject(appCheck.clientEmail)
            .setAudience(APP_CHECK_CUSTOM_TOKEN_AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(appCheck.customTokenLifetime ?? DEFAULT_CUSTOM_TOKEN_LIFETIME)
            .sign(privateKey);
        const url = `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appCheck.appId}:exchangeCustomToken`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customToken }),
        });
        if (!res.ok) {
            await reportError(config, {
                error: new Error(`exchangeCustomToken failed: ${res.status} ${await res.text()}`),
                classOrMethodName: 'mintServerAppCheckToken',
            });
            return undefined;
        }
        const data = await res.json();
        return data.token;
    }
    catch (error) {
        await reportError(config, { error, classOrMethodName: 'mintServerAppCheckToken' });
        return undefined;
    }
}

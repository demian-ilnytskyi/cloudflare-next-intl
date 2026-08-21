import config from '@intl-config';
import reportError from '../../error_handling/report_error';
import signCustomTokenRemote from './sign_custom_token_remote';
// Matches `firebase-admin`'s own `AppCheckTokenGenerator.createCustomToken`
// exactly (`token-generator.js`) — this specific audience (the App Check
// TOKEN EXCHANGE service, not the App Check API resource name itself) is
// REQUIRED. The wrong-but-plausible-looking
// `.../google.firebase.appcheck.v1.FirebaseAppCheck` audience gets rejected
// by `exchangeCustomToken` with an opaque `403 App attestation failed`, with
// no indication the audience is the problem.
const APP_CHECK_CUSTOM_TOKEN_AUDIENCE = 'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService';
// `firebase-admin` hardcodes this custom token's own lifetime to 5 minutes
// and does not expose it as configurable — it's a short-lived credential
// whose only job is to be immediately exchanged for the actual App Check
// token (whose own lifetime is controlled by Firebase, separately). Mirrored
// here as a fixed value rather than the configurable
// `customTokenLifetime` this used to be: Google's real backend rejects
// longer lifetimes outright, so making it configurable only offered a
// footgun with no working range above this default.
const CUSTOM_TOKEN_LIFETIME = '5m';
/**
 * Mints a fresh App Check token server-side via a service account, for use
 * when the client-written App Check cookie (see `appCheckTokenCookieName`)
 * is absent — e.g. a cold navigation before `AuthUserProvider` has run and
 * had a chance to write it. Requires `clientEmail`/`appId` on
 * `firebaseAuth.appCheck`, plus either `privateKey` or the
 * `oauthClientId`/`oauthClientSecret`/`oauthRefreshToken` triple; returns
 * `undefined` (never throws) if the exchange fails, so a caller can always
 * fall back to "no App Check token" exactly as before this existed.
 *
 * Signs a short-lived custom JWT, then exchanges it for an App Check token
 * via `exchangeCustomToken`, authenticated with the project's Web API key
 * (`?key=`) — `exchangeCustomToken` otherwise rejects the call outright as
 * an unregistered/unidentified caller (403 `PERMISSION_DENIED`), before the
 * custom token itself is even evaluated. Not cached beyond the caller's own
 * request-scoped `cache()` wrapper — a fresh mint costs one signing
 * operation plus one network round-trip, acceptable per-request but not
 * worth doing more than once per request.
 *
 * The custom token is signed one of two ways, `privateKey` taking priority
 * when both are set:
 * - `privateKey` set: signed locally (`jose`, Edge/WebCrypto-compatible —
 *   no `firebase-admin`).
 * - OAuth triple set instead: signed remotely via
 *   `sign_custom_token_remote.ts` (IAM Credentials `signJwt`) — the way to
 *   mint tokens when a GCP org policy blocks creating the service-account
 *   key `privateKey` would otherwise require.
 */
export default async function mintServerAppCheckToken(projectId, apiKey, appCheck) {
    if (!appCheck?.clientEmail || !appCheck.appId)
        return undefined;
    const hasOauthTriple = appCheck.oauthClientId && appCheck.oauthClientSecret && appCheck.oauthRefreshToken;
    if (!appCheck.privateKey && !hasOauthTriple)
        return undefined;
    try {
        const claims = {
            iss: appCheck.clientEmail,
            sub: appCheck.clientEmail,
            aud: APP_CHECK_CUSTOM_TOKEN_AUDIENCE,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
            app_id: appCheck.appId,
        };
        const customToken = appCheck.privateKey
            ? await (async () => {
                const { SignJWT, importPKCS8 } = await import('jose');
                const privateKey = await importPKCS8(appCheck.privateKey.replace(/\\n/g, '\n'), 'RS256');
                return new SignJWT({ app_id: appCheck.appId })
                    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
                    .setIssuer(appCheck.clientEmail)
                    .setSubject(appCheck.clientEmail)
                    .setAudience(APP_CHECK_CUSTOM_TOKEN_AUDIENCE)
                    .setIssuedAt()
                    .setExpirationTime(CUSTOM_TOKEN_LIFETIME)
                    .sign(privateKey);
            })()
            : await signCustomTokenRemote(appCheck.clientEmail, claims, {
                clientId: appCheck.oauthClientId,
                clientSecret: appCheck.oauthClientSecret,
                refreshToken: appCheck.oauthRefreshToken,
            });
        const url = `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appCheck.appId}:exchangeCustomToken?key=${apiKey}`;
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

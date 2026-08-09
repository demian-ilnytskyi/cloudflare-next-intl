import config from '@intl-config';
import type { FirebaseAppCheckConfig } from '../../types/types';
import reportError from '../../error_handling/report_error';

// Matches `firebase-admin`'s own `AppCheckTokenGenerator.createCustomToken`
// exactly (`token-generator.js`) — this specific audience (the App Check
// TOKEN EXCHANGE service, not the App Check API resource name itself) is
// REQUIRED. The wrong-but-plausible-looking
// `.../google.firebase.appcheck.v1.FirebaseAppCheck` audience gets rejected
// by `exchangeCustomToken` with an opaque `403 App attestation failed`, with
// no indication the audience is the problem.
const APP_CHECK_CUSTOM_TOKEN_AUDIENCE =
    'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService';
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
 * had a chance to write it. Requires `clientEmail`/`privateKey`/`appId` on
 * `firebaseAuth.appCheck`; returns `undefined` (never throws) if the
 * exchange fails, so a caller can always fall back to "no App Check token"
 * exactly as before this existed.
 *
 * Signs a short-lived custom JWT with the service account's private key
 * (`jose`, Edge/WebCrypto-compatible — no `firebase-admin`), then exchanges
 * it for an App Check token via `exchangeCustomToken`, authenticated with
 * the project's Web API key (`?key=`) — `exchangeCustomToken` otherwise
 * rejects the call outright as an unregistered/unidentified caller
 * (403 `PERMISSION_DENIED`), before the custom token itself is even
 * evaluated. Not cached beyond the caller's own request-scoped `cache()`
 * wrapper — a fresh mint costs one signing operation plus one network
 * round-trip, acceptable per-request but not worth doing more than once per
 * request.
 */
export default async function mintServerAppCheckToken(
    projectId: string,
    apiKey: string,
    appCheck: FirebaseAppCheckConfig | undefined,
): Promise<string | undefined> {
    if (!appCheck?.clientEmail || !appCheck.privateKey || !appCheck.appId) return undefined;

    try {
        const { SignJWT, importPKCS8 } = await import('jose');
        const privateKey = await importPKCS8(appCheck.privateKey.replace(/\\n/g, '\n'), 'RS256');

        const customToken = await new SignJWT({ app_id: appCheck.appId })
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            .setIssuer(appCheck.clientEmail)
            .setSubject(appCheck.clientEmail)
            .setAudience(APP_CHECK_CUSTOM_TOKEN_AUDIENCE)
            .setIssuedAt()
            .setExpirationTime(CUSTOM_TOKEN_LIFETIME)
            .sign(privateKey);

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

        const data = await res.json() as { token?: string };
        return data.token;
    } catch (error) {
        await reportError(config, { error, classOrMethodName: 'mintServerAppCheckToken' });
        return undefined;
    }
}

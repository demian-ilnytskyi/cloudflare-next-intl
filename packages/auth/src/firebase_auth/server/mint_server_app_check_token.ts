import config from '@intl-config';
import type { FirebaseAppCheckConfig } from '../../types.js';
import reportError from 'cloudflare-next-intl-errors/internal/reportError';
import signServiceAccountJwt from './sign_service_account_jwt.js';

// Matches `firebase-admin`'s own `AppCheckTokenGenerator.createCustomToken`
// exactly (`token-generator.js`) — this specific audience (the App Check
// TOKEN EXCHANGE service, not the App Check API resource name itself) is
// REQUIRED. The wrong-but-plausible-looking
// `.../google.firebase.appcheck.v1.FirebaseAppCheck` audience gets rejected
// by `exchangeCustomToken` with an opaque `403 App attestation failed`, with
// no indication the audience is the problem.
const APP_CHECK_CUSTOM_TOKEN_AUDIENCE =
    'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService';

// Reported once per process, not once per request: the config can't change
// between requests, so repeating it would flood `onError` (Sentry, Telegram)
// with one identical event per cold navigation. Exported so tests can clear
// it between cases.
export const missingCredentialsReportState = { reported: false };

/**
 * Reports an `appCheck` block that is configured but can't actually mint a
 * token server-side — missing `clientEmail`/`appId`, or neither of the two
 * signing credentials (`privateKey` / the OAuth triple). Opt out with
 * `appCheck.reportMissingServerCredentials: false`; on by default in dev
 * and prod. Never throws — the caller still falls back to "no App Check
 * token".
 */
async function reportMissingCredentials(
    appCheck: FirebaseAppCheckConfig,
    hasOauthTriple: boolean,
): Promise<void> {
    if (appCheck.reportMissingServerCredentials === false) return;
    if (missingCredentialsReportState.reported) return;
    missingCredentialsReportState.reported = true;

    const missing: string[] = [];
    if (!appCheck.clientEmail) missing.push('clientEmail');
    if (!appCheck.appId) missing.push('appId');
    if (!appCheck.privateKey && !hasOauthTriple) {
        missing.push('privateKey (or the full oauthClientId/oauthClientSecret/oauthRefreshToken triple)');
    }

    await reportError(config, {
        error: new Error(
            `firebaseAuth.appCheck is configured but cannot mint an App Check token server-side — missing: ${missing.join(', ')}. `
            + 'Signed-in users will render as signed-out on any cold navigation that arrives before the client writes the App Check cookie. '
            + 'Set the missing service-account values, or pass `appCheck.reportMissingServerCredentials: false` to silence this.',
        ),
        classOrMethodName: 'mintServerAppCheckToken',
        dedupKey: 'mintServerAppCheckToken:missing-server-credentials',
    });
}

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
export default async function mintServerAppCheckToken(
    projectId: string,
    apiKey: string,
    appCheck: FirebaseAppCheckConfig | undefined,
): Promise<string | undefined> {
    if (!appCheck) return undefined;
    const hasOauthTriple = Boolean(appCheck.oauthClientId && appCheck.oauthClientSecret && appCheck.oauthRefreshToken);
    if (!appCheck.clientEmail || !appCheck.appId || (!appCheck.privateKey && !hasOauthTriple)) {
        await reportMissingCredentials(appCheck, hasOauthTriple);
        return undefined;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const customToken = await signServiceAccountJwt(appCheck, {
            iss: appCheck.clientEmail,
            sub: appCheck.clientEmail,
            aud: APP_CHECK_CUSTOM_TOKEN_AUDIENCE,
            iat: now,
            exp: now + 300,
            app_id: appCheck.appId,
            ...(appCheck.customTokenTtlSeconds ? { ttl: `${appCheck.customTokenTtlSeconds}s` } : {}),
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

        const data = await res.json() as { token?: string };
        return data.token;
    } catch (error) {
        await reportError(config, { error, classOrMethodName: 'mintServerAppCheckToken' });
        return undefined;
    }
}

import type { FirebaseAppCheckConfig } from '../../types/types.js';
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
export default function mintServerAppCheckToken(projectId: string, apiKey: string, appCheck: FirebaseAppCheckConfig | undefined): Promise<string | undefined>;

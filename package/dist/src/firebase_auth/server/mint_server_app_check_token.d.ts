import type { FirebaseAppCheckConfig } from '../../types/types';
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
 * it for an App Check token via `exchangeCustomToken`. Not cached beyond the
 * caller's own request-scoped `cache()` wrapper — a fresh mint costs one
 * signing operation plus one network round-trip, acceptable per-request but
 * not worth doing more than once per request.
 */
export default function mintServerAppCheckToken(projectId: string, appCheck: FirebaseAppCheckConfig | undefined): Promise<string | undefined>;

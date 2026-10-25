import type { User } from '@firebase/auth';

export interface DeviceBindingStore {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface DeviceBindingConfig {
    store: DeviceBindingStore;
    proofMaxAgeSeconds?: number;
}

export interface FirebaseAppCheckConfig {
    /** Cloudflare Turnstile site key. When set, Turnstile is used for App Check client challenges instead of reCAPTCHA. */
    turnstileSiteKey?: string;
    /** Cloudflare Turnstile secret key, used ONLY server-side to verify Turnstile challenge tokens before minting an App Check token. Never read on the client. */
    turnstileSecretKey?: string;
    /**
     * When `turnstileSiteKey` is set, Turnstile script and widget are preloaded
     * on the client as soon as App Check initializes (default `true`), warming up
     * the container and script in advance. Set to `false` for lazy loading (loads
     * only upon first challenge execution).
     */
    preloadTurnstile?: boolean;
    /**
     * With both `turnstileSiteKey` and `recaptchaV3SiteKey` set, a failed
     * Turnstile challenge falls back to reCAPTCHA v3 once (default `true`).
     * Set `false` to use Turnstile only.
     */
    recaptchaFallback?: boolean;
    /** reCAPTCHA v3 site key. Mutually exclusive with `recaptchaEnterpriseSiteKey`. */
    recaptchaV3SiteKey?: string;
    /** reCAPTCHA Enterprise site key. Mutually exclusive with `recaptchaV3SiteKey`. */
    recaptchaEnterpriseSiteKey?: string;
    /**
     * When `recaptchaV3SiteKey` is set, App Check defaults (`true`, or
     * omitted) to a `CustomProvider` that renders an invisible reCAPTCHA
     * widget and calls `window.grecaptcha.execute` directly, instead of
     * Firebase's `ReCaptchaV3Provider`. `ReCaptchaV3Provider` injects its
     * own `<script>` internally, which spawns a background worker
     * (`api2/webworker.js`) that independently re-fetches
     * `recaptcha__en.js` — in browsers with no persistent HTTP cache (e.g.
     * Firefox private windows), that second fetch can hit a different CDN
     * edge than the main-thread script tag, tripping a `sha384` integrity
     * mismatch and an infinite retry loop that freezes the tab. The
     * `CustomProvider` path requires the consumer to load
     * `https://www.google.com/recaptcha/api.js?render=explicit` themselves
     * (e.g. via `next/script`) before App Check initializes; it replicates
     * `ReCaptchaV3Provider`'s widget-render and token-exchange flow against
     * the same public `exchangeRecaptchaV3Token` endpoint. Set to `false`
     * to use Firebase's own `ReCaptchaV3Provider` instead.
     */
    useExplicitRecaptchaScript?: boolean;
    /**
     * Enables App Check's debug token on this client. Pass `true` to have
     * the Firebase SDK generate a new random token each run (logged to the
     * console — register it in the Firebase console every time it changes).
     * Pass a fixed UUID string instead to reuse the same token across
     * restarts/builds — set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` to it
     * before init, register that one UUID once, and it never changes.
     * Use only for local development — never set this in production.
     */
    debugToken?: boolean | string;
    /**
     * Forwarded to `initializeAppCheck`'s `isTokenAutoRefreshEnabled`. Defaults to `false`:
     * tokens are fetched on demand only, so a challenge never runs on page load or in a
     * background tab — set `true` to have the SDK fetch eagerly and refresh before expiry.
     */
    isTokenAutoRefreshEnabled?: boolean;
    /**
     * Lifetime (seconds) of App Check tokens minted server-side via
     * `exchangeCustomToken` (Turnstile provider + server minting), sent as the
     * custom token's `ttl` claim. Firebase accepts 1800–604800 (30 min–7 days);
     * omitted → Firebase default (1 hour).
     */
    customTokenTtlSeconds?: number;
    /**
     * Service account client email, used ONLY server-side to mint an App
     * Check token when the client-written App Check cookie is absent (e.g.
     * a cold navigation before `AuthUserProvider` has run — see
     * `appCheckTokenCookieName`). Required alongside `appId`, plus either
     * `privateKey` or the `oauthClientId`/`oauthClientSecret`/
     * `oauthRefreshToken` triple, for server-side minting. Never sent to the
     * client — read only by `firebase_server.ts`.
     */
    clientEmail: string;
    /**
     * Service account private key (PEM), paired with `clientEmail` for
     * server-side App Check token minting. Same server-only, secret-bearing
     * field as `clientEmail` — set from an untrusted-by-the-client env var
     * (e.g. `process.env.FIREBASE_PRIVATE_KEY`), never exposed to the
     * browser. Escaped `\n` sequences (common when stored in a single-line
     * env var) are unescaped automatically before use.
     *
     * Omit this and set the `oauthClientId`/`oauthClientSecret`/
     * `oauthRefreshToken` triple instead when your GCP org enforces
     * `iam.disableServiceAccountKeyCreation`, which blocks issuing this key
     * in the first place. When both are set, `privateKey` takes priority.
     */
    privateKey?: string;
    /**
     * Application Default Credentials OAuth client ID — the `client_id`
     * field from `application_default_credentials.json` (see
     * `gcloud auth application-default login`). Paired with
     * `oauthClientSecret` and `oauthRefreshToken` as an alternative to
     * `privateKey`: instead of signing the App Check custom token locally,
     * it's signed remotely via IAM Credentials `signJwt`, authenticated as
     * this OAuth identity. That identity needs
     * `roles/iam.serviceAccountTokenCreator` on `clientEmail`. Use this when
     * a service-account key can't be created (see `privateKey`). Ignored
     * when `privateKey` is set.
     */
    oauthClientId?: string;
    /** OAuth client secret paired with `oauthClientId`. Same ADC-JSON `client_secret` field, same secret-handling rules as `privateKey`. */
    oauthClientSecret?: string;
    /** OAuth refresh token paired with `oauthClientId`. Same ADC-JSON `refresh_token` field, same secret-handling rules as `privateKey`. */
    oauthRefreshToken?: string;
    /**
     * Firebase App Check app ID (e.g. `"1:1234567890:web:abcdef123456"`),
     * required alongside `clientEmail` for server-side minting. Distinct
     * from the Firebase Auth `appId` on `FirebaseAuthRoutingConfig` itself —
     * App Check registers apps separately.
     */
    appId: string;
    /**
     * Whether a missing/incomplete server-side signing credential is
     * reported as an error. `appCheck` being configured means App Check
     * enforcement is expected, but server-side minting additionally needs
     * `clientEmail` + `appId` plus ONE of the two signing credentials
     * (`privateKey`, or the full `oauthClientId`/`oauthClientSecret`/
     * `oauthRefreshToken` triple). Without one of those,
     * `mintServerAppCheckToken` silently returns `undefined` and every
     * cold navigation of a signed-in user renders as signed-out — a
     * misconfiguration that is invisible until then.
     *
     * Defaults to `true` in every environment (dev and prod alike): the
     * error is reported once per process via `errorHandling.onError` and
     * `console.error`, and never throws. Set to `false` to opt out when
     * you intentionally rely on the client-written App Check cookie only.
     */
    reportMissingServerCredentials?: boolean;
}

export interface FirebaseAuthRoutingConfig {
    /**
     * Whether `intlMiddleware` should automatically run the firebase_auth
     * redirect/session-refresh logic (guest→`redirectAuthPath`, signed-in→
     * `homePath` on auth pages, ID-token refresh) for every request.
     * Defaults to `true` — set `false` to keep `firebaseAuth` configured
     * (e.g. for the client/server providers, actions) while driving the
     * middleware redirect logic yourself instead.
     */
    middlewareEnabled?: boolean;
    /**
     * Whether `IntlProvider` should automatically wrap your app in the
     * client `AuthUserProvider` and call `resolveAuthUser` server-side.
     * Defaults to `true`. Set `false` if you drive auth entirely from your
     * own middleware (like `middlewareEnabled: false`'s manual-override
     * case, but for the client/RSC layer) and don't want this package
     * rendering any auth-related React tree on top of it — e.g. if you
     * only use `intlMiddleware`'s built-in session-refresh/redirect logic
     * and have no use for `useAuthUser()`/`AuthUserProvider` at all.
     */
    autoWireClientProvider?: boolean;
    /** Firebase project's Web API key (`NEXT_PUBLIC_FIREBASE_API_KEY` equivalent). */
    apiKey: string;
    /** Firebase project's auth domain, e.g. "my-app.firebaseapp.com". */
    authDomain: string;
    /** Firebase project ID. */
    projectId: string;
    /** Firebase project's storage bucket. */
    storageBucket?: string;
    /** Firebase project's messaging sender ID. */
    messagingSenderId?: string;
    /** Firebase app ID. */
    appId: string;
    /** Firebase Analytics measurement ID. */
    measurementId?: string;
    /**
     * Whether Firebase Performance Monitoring is initialized on the client.
     * Enabled (`true`) by default when `firebaseAuth` is configured.
     * Set `false` to disable Performance Monitoring initialization.
     */
    performance?: boolean;
    /**
     * Enables Firebase App Check on the client. Omit to leave App Check
     * uninitialized — required if App Check enforcement is turned on for
     * Auth/Firestore/etc. in the Firebase console, or every request gets
     * rejected with 401.
     */
    appCheck?: FirebaseAppCheckConfig;
    /**
     * Skips the Auth SDK's default `browserPopupRedirectResolver`, which — on
     * mobile/Safari/iOS user agents — proactively opens the
     * `<authDomain>/__/auth/iframe.js` relay iframe on EVERY page load to be
     * ready for a redirect result, whether or not one is ever used.
     */
    skipPopupRedirectResolver?: boolean;
    /** Path to redirect signed-out users to, e.g. "/login". Must start with "/" — `setIntlConfig` auto-corrects a missing leading slash with a warning. */
    redirectAuthPath: string;
    /** Path to redirect signed-in users away from auth pages to, e.g. "/". Must start with "/" — `setIntlConfig` auto-corrects a missing leading slash with a warning. */
    homePath: string;
    /** Path to redirect unverified-email users to. Omit to skip email-verification redirects. Must start with "/" — `setIntlConfig` auto-corrects a missing leading slash with a warning. */
    verifyEmailPath?: string;
    /**
     * Path handling an emailed password-reset link. Firebase allows only ONE
     * project-wide action URL, so every template lands on the same URL with
     * a `?mode=` query param; the middleware reads that param and forwards
     * the request (query string intact, `oobCode` included) to the path for
     * that mode. Defaults to `'/reset-password'`. Must start with "/" —
     * `setIntlConfig` auto-corrects a missing leading slash with a warning.
     */
    resetPasswordPath?: string;
    /**
     * Path handling an emailed `recoverEmail` action link (undo an email
     * change). Omit to leave that mode unhandled — the request then falls
     * through to normal routing instead of being forwarded. Must start with
     * "/" — `setIntlConfig` auto-corrects a missing leading slash with a
     * warning.
     */
    recoverEmailPath?: string;
    /**
     * Path handling an emailed passwordless `signIn` action link. Omit to
     * leave that mode unhandled — the request then falls through to normal
     * routing instead of being forwarded. Must start with "/" —
     * `setIntlConfig` auto-corrects a missing leading slash with a warning.
     */
    signInPath?: string;
    /**
     * Extra/overriding `?mode=` → path entries for the emailed-action-link
     * forward described on {@link resetPasswordPath}. Merged over the
     * defaults derived from `resetPasswordPath`/`verifyEmailPath`/
     * `recoverEmailPath`, so this is how you handle a mode this config has
     * no dedicated field for (e.g. `verifyAndChangeEmail`) or point one of
     * the known modes somewhere else. Keys are raw Firebase `mode` values.
     */
    actionModePaths?: Readonly<Record<string, string>>;
    /**
     * Set `false` to disable the emailed-action-link forward entirely (see
     * {@link resetPasswordPath}) and let `?mode=` URLs route normally.
     * Defaults to `true`.
     */
    actionLinkRedirectEnabled?: boolean;
    /**
     * When `true` (the default), if an emailed-action-link carries a `continueUrl` query parameter
     * matching the request's origin (same domain/app), the middleware will redirect to `continueUrl`'s
     * path instead of the static mode path (e.g. `resetPasswordPath`). Set `false` to disable.
     */
    followSameOriginContinueUrl?: boolean;
    /**
     * Restricts the emailed-action-link forward (see {@link resetPasswordPath})
     * to this exact static path — set this to whatever path your Firebase
     * Console "action URL" is pinned to (e.g. `'/auth/action'`) so a `?mode=`
     * on any other page is left alone instead of being treated as an action
     * link. Omit to match Firebase's bare-domain-root default: any path
     * carrying `?mode=` is eligible. Must start with "/" — `setIntlConfig`
     * auto-corrects a missing leading slash with a warning.
     */
    actionLinkPath?: string;
    /**
     * Whether a same-origin emailed-action-link forward strips Firebase's own
     * `mode`/`apiKey`/`lang`/`continueUrl` params, landing the user on a clean
     * `?oobCode=` URL. Defaults to `true`. Set `false` to keep the full query
     * when the destination page reads those params itself. Cross-origin
     * redirects always keep the full query, as do `mode=signIn` forwards —
     * `signInWithEmailLink` re-parses the landed URL and rejects it without
     * Firebase's own `mode`/`apiKey`.
     */
    stripActionLinkQuery?: boolean;
    /**
     * Whether the middleware's own redirects (`redirectAuthPath`, `homePath`,
     * `verifyEmailPath`) carry over the original request's query string —
     * e.g. `/login?ref=abc` stays `/login?ref=abc` after redirecting to
     * `homePath` for a signed-in user, instead of dropping to `/`. Defaults
     * to `true`. The emailed-action-link forward (see
     * {@link resetPasswordPath}) always preserves `oobCode` regardless of
     * this setting, since it must survive that hop; when the forward stays on
     * this origin it drops Firebase's own `mode`/`apiKey`/`lang`/`continueUrl`
     * params, which the destination page no longer needs.
     */
    preserveRedirectQuery?: boolean;
    /** Returns true if the given (locale-stripped) path is an auth page (login/signup/etc). */
    isAuthPath: (path: string) => boolean;
    /** Locale-stripped paths exempt from all auth redirects (e.g. public marketing pages). */
    whiteListPaths?: readonly string[];
    /**
     * Returns true for a (locale-stripped) path that requires a session — the
     * inverse of {@link whiteListPaths}. When supplied, it replaces
     * `whiteListPaths` as the gate: every path is passed through unless this
     * returns true (or `isAuthPath` does), so an unrecognised URL reaches the
     * app's own routing/404 handling instead of being redirected to
     * `redirectAuthPath`. Prefer this over `whiteListPaths` for apps where
     * most pages are public and only a known subtree needs a session.
     */
    protectedPaths?: (path: string) => boolean;
    /** Session cookie max-age in seconds. Defaults to 5 days (432000). */
    sessionCookieMaxAge?: number;
    /** Refresh-token cookie max-age in seconds. Defaults to 365 days (31536000). */
    refreshTokenCookieMaxAge?: number;
    /** Session cookie name. Defaults to `'__fa_session__'`. Override this if your app already uses a different name for its Firebase ID-token cookie. */
    sessionCookieName?: string;
    /** Refresh-token cookie name. Defaults to `'__fa_refresh_token__'`. Override this if your app already uses a different name for its Firebase refresh-token cookie. */
    refreshTokenCookieName?: string;
    /** Session marker cookie name. Defaults to `'__fa_has_session__'`. Non-httpOnly; indicates the server holds a session. */
    sessionMarkerCookieName?: string;
    /** Email-verified hint cookie name. Defaults to `'__fa_email_verified_hint__'`. Client-written, non-httpOnly; lets the middleware avoid an unnecessary token refresh when its view already matches the client's. */
    emailVerifiedHintCookieName?: string;
    /**
     * App Check token cookie name. Defaults to `'__fa_app_check_token__'`.
     * Client-written, non-httpOnly; carries the client's live App Check
     * token to the server so `getAuthUser()`/`getAuthenticatedAppForUser`
     * can pass it to `initializeServerApp`. Only relevant when `appCheck`
     * is configured AND App Check enforcement is turned on for Auth in the
     * Firebase console — otherwise `initializeServerApp` rejects every
     * request with `auth/firebase-app-check-token-is-invalid`.
     */
    appCheckTokenCookieName?: string;
    /**
     * App Check token cookie max-age in seconds. Defaults to 1 hour (3600) —
     * matches the App Check token's own default lifetime, so the cookie
     * doesn't outlive the token it holds.
     */
    appCheckTokenCookieMaxAge?: number;
    /**
     * Called once, the moment `AuthUserProvider` observes a real sign-in
     * (a `null → user` transition) — never on a plain token refresh of an
     * already-signed-in user. Runs after the session/refresh-token/
     * email-verified-hint cookies have already been written for this
     * user, so cookie state is in sync when this fires. A throw/rejection
     * is caught and logged via `console.error`; it never blocks cookie
     * sync or navigation.
     */
    onSignIn?: (user: User) => void | Promise<void>;
    /**
     * Called once, on the `false → true` transition of `user.emailVerified`
     * — never on a later observation of an already-verified user. Checked
     * from both `AuthUserProvider`'s `onIdTokenChanged` listener and its
     * `reloadUser()`, since either can be the first to observe the
     * transition. A throw/rejection is caught and logged via
     * `console.error`.
     */
    onEmailVerified?: (user: User) => void | Promise<void>;
    /**
     * Called once, when sign-out is confirmed — after `AuthUserProvider`'s
     * existing debounce for transient SDK null-callbacks (two consecutive
     * `onIdTokenChanged(null)` calls), not on the first, possibly
     * transient, null. Runs after the session/refresh-token cookies have
     * already been cleared. A throw/rejection is caught and logged via
     * `console.error`.
     */
    onSignOut?: () => void | Promise<void>;
    /**
     * Opt-in device binding configuration. When set, sessions are bound to a client-side
     * non-extractable device key stored in IndexedDB.
     */
    deviceBinding?: DeviceBindingConfig;
    /** Device proof cookie name. Defaults to `'__fa_device_proof__'`. */
    deviceProofCookieName?: string;
    /** Called when a lost device key cannot be silently rebound and requires reauthentication. */
    onReauthRequired?: () => void | Promise<void>;
}

export type {
    SerializedAuthUser,
    AuthFormState,
    AuthActionMessages,
    AuthUser,
    AuthActionCodeSettings,
} from './firebase_auth/types.js';

import { NextResponse, type NextRequest } from 'next/server';
import config from '@intl-config';
import decodeJwtPayload from '../decode_jwt_payload';
import isWhitelisted from '../is_whitelisted';

export const defaultSessionCookieName = '__fa_session__';
export const defaultRefreshTokenCookieName = '__fa_refresh_token__';
// Non-httpOnly: written by AuthUserProvider (client) every time it observes
// the live Firebase user's emailVerified state, so the middleware can tell
// "the client already agrees with this claim" (no refresh needed) apart
// from "the client last observed something different" (claim may be stale
// — force one refresh). Readable client-side is fine: it carries no secret,
// only a boolean mirror of a claim already inside the session JWT.
export const defaultEmailVerifiedHintCookieName = '__fa_email_verified_hint__';
// Non-httpOnly: written by AuthUserProvider (client) whenever it mints a
// fresh App Check token, so the server can forward it to
// `initializeServerApp` — required whenever App Check enforcement is on for
// Auth, or every server-side `getAuthUser()` call is rejected with
// `auth/firebase-app-check-token-is-invalid`. Carries no secret beyond what
// the client already attaches to every Firebase SDK request itself.
export const defaultAppCheckTokenCookieName = '__fa_app_check_token__';

export const defaultResetPasswordPath = '/reset-password';

/**
 * Firebase's console exposes ONE project-wide action URL, so every email
 * template (password reset, email verification, email recovery) lands on that
 * same URL and distinguishes itself only by `?mode=`. This maps those raw
 * `mode` values onto the app's own pages so each link reaches the page that
 * knows how to consume its `oobCode`.
 */
function resolveActionModePaths(fa: NonNullable<typeof config.firebaseAuth>): Record<string, string> {
    const paths: Record<string, string> = {
        resetPassword: fa.resetPasswordPath ?? defaultResetPasswordPath,
    };
    if (fa.verifyEmailPath) paths.verifyEmail = fa.verifyEmailPath;
    if (fa.recoverEmailPath) paths.recoverEmail = fa.recoverEmailPath;
    return { ...paths, ...fa.actionModePaths };
}

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 5;
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 365;

// Refresh slightly before the real expiry — treating a token as expired
// right up to its last second means normal clock skew or in-flight request
// time can hand a client a token that dies moments after this check, forcing
// an extra round-trip on the very next request.
const CLOCK_SKEW_MARGIN_MS = 60 * 1000;

function isJwtExpired(token: string): boolean {
    const decoded = decodeJwtPayload(token);
    return !decoded?.exp || decoded.exp * 1000 - CLOCK_SKEW_MARGIN_MS <= Date.now();
}

// Refreshing an ID token is a real network round-trip to Google on the
// Edge middleware's critical path, on every request where the session
// cookie has expired — which, for any session older than the ~1hr ID-token
// lifetime, is every request until the client re-syncs. Firebase refresh
// tokens don't rotate on use (the API returns the same refresh_token back)
// — THIS is the precondition that makes caching by refresh-token identity
// safe: if Firebase ever changed that behavior, this cache would hand out
// a refresh token the client no longer holds. Given that precondition,
// caching a successful refresh result is a pure memoization: a cache hit
// skips the round-trip entirely, a miss falls through to the exact same
// fetch this function always made. Only available on Cloudflare Workers
// (`caches.default`); everywhere else this is a no-op and every request
// pays the full round-trip, same as before this change. The synthetic
// origin below is safe as a Cache API key specifically because
// `.internal` is a non-resolvable TLD reserved by convention — no real
// `fetch()` in this Worker could ever have populated (or could ever
// collide with) an entry under it.
const REFRESH_CACHE_TTL_SECONDS = 50 * 60;
const REFRESH_CACHE_KEY_ORIGIN = 'https://firebase-auth-refresh-cache.internal';

function getEdgeCache(): Cache | undefined {
    const cachesApi = (globalThis as { caches?: { default?: Cache } }).caches;
    return cachesApi?.default;
}

async function hashRefreshToken(refreshToken: string): Promise<string> {
    const data = new TextEncoder().encode(refreshToken);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getCachedRefresh(refreshToken: string): Promise<{ idToken: string; refreshToken: string } | null> {
    const cache = getEdgeCache();
    if (!cache) return null;
    try {
        const key = `${REFRESH_CACHE_KEY_ORIGIN}/${await hashRefreshToken(refreshToken)}`;
        const cached = await cache.match(key);
        if (!cached) return null;
        return await cached.json() as { idToken: string; refreshToken: string };
    } catch {
        return null;
    }
}

async function setCachedRefresh(refreshToken: string, refreshed: { idToken: string; refreshToken: string }): Promise<void> {
    const cache = getEdgeCache();
    if (!cache) return;
    try {
        const key = `${REFRESH_CACHE_KEY_ORIGIN}/${await hashRefreshToken(refreshToken)}`;
        await cache.put(key, new Response(JSON.stringify(refreshed), {
            headers: { 'Cache-Control': `max-age=${REFRESH_CACHE_TTL_SECONDS}` },
        }));
    } catch {
        // Best-effort: a caching failure must never affect the actual
        // refresh result already returned to the caller.
    }
}

// Google's Secure Token API returns 400 with one of these error codes when
// the refresh token itself is the problem (expired/revoked/malformed/the
// associated user no longer exists) — this is the ONLY case that should
// sign the user out. Any other failure (5xx, network error, timeout,
// unrecognized 400 body) is transient/unexpected and must NOT clear the
// refresh-token cookie or redirect to login: doing so previously caused a
// signed-in user with a perfectly valid refresh token to flash to /login
// and bounce back home the moment their ID token merely expired and a
// single refresh attempt happened to fail.
const INVALID_REFRESH_TOKEN_ERRORS = new Set([
    'INVALID_REFRESH_TOKEN',
    'TOKEN_EXPIRED',
    'USER_DISABLED',
    'USER_NOT_FOUND',
]);

type RefreshResult =
    | { status: 'refreshed'; idToken: string; refreshToken: string }
    | { status: 'invalid' }
    | { status: 'transient-failure' };

/**
 * Mints a fresh ID token from a stored refresh token via Google's Secure
 * Token API. No `firebase/auth` import: this runs in the Edge middleware
 * runtime, and `firebase/auth` pulls in Node-only APIs that break Edge
 * bundles even though this function never touches that module.
 */
async function refreshIdToken(apiKey: string, refreshToken: string): Promise<RefreshResult> {
    const cached = await getCachedRefresh(refreshToken);
    if (cached) return { status: 'refreshed', ...cached };

    try {
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        });

        if (!res.ok) {
            if (res.status === 400) {
                try {
                    const errorBody = await res.json() as { error?: { message?: string } };
                    if (errorBody.error?.message && INVALID_REFRESH_TOKEN_ERRORS.has(errorBody.error.message)) {
                        return { status: 'invalid' };
                    }
                } catch {
                    // Unparseable body on a 400 — treat as transient rather
                    // than assuming the token is invalid.
                }
            }
            return { status: 'transient-failure' };
        }

        const data = await res.json() as { id_token: string; refresh_token: string };
        const refreshed = { idToken: data.id_token, refreshToken: data.refresh_token };
        // Not awaited: the cache write is a pure optimization for FUTURE
        // requests, not this one — blocking this response on it would
        // reintroduce the exact latency this fix exists to remove.
        // setCachedRefresh already swallows its own errors, so a rejected
        // write here would otherwise surface as an unhandled rejection.
        void setCachedRefresh(refreshToken, refreshed);
        return { status: 'refreshed', ...refreshed };
    } catch {
        return { status: 'transient-failure' };
    }
}

/**
 * Layers Firebase session-cookie validation/refresh and auth redirects onto
 * an already-built middleware response. Called internally by `intlMiddleware`
 * (via dynamic import) when `config.firebaseAuth` is set and
 * `middlewareEnabled !== false` — not intended to be called directly unless
 * that auto-wiring is opted out of.
 *
 * @param baseResponse The response `intlMiddleware` already produced for
 *   locale routing (its own next()/rewrite()/redirect(), with the locale
 *   cookie / bot cookie / `Content-Language` header already set). On the
 *   pass-through path this function returns `baseResponse` itself (with
 *   Firebase cookies layered on) so none of that is dropped; on the
 *   guest/auth-page redirect paths it returns a NEW response instead, since
 *   a redirect response can't also carry forward a rewrite/next decision —
 *   its cookies/headers are copied across from `baseResponse` so locale
 *   state still survives the redirect.
 * @param locale The effective locale `intlMiddleware` resolved for this request.
 */
export default async function updateSession(
    request: NextRequest,
    baseResponse: NextResponse,
    locale: string,
): Promise<NextResponse> {
    const fa = config.firebaseAuth;
    if (!fa || fa.middlewareEnabled === false) return baseResponse;

    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const emailVerifiedHintCookieName = fa.emailVerifiedHintCookieName ?? defaultEmailVerifiedHintCookieName;

    const rawPath = request.nextUrl.pathname;
    const requestPrefix = `/${locale}`;
    const path = rawPath === requestPrefix || rawPath.startsWith(`${requestPrefix}/`)
        ? rawPath.slice(requestPrefix.length) || '/'
        : rawPath;

    const lastSegment = rawPath.slice(rawPath.lastIndexOf('/') + 1);
    if (rawPath.startsWith('/_next') || /\.[a-zA-Z0-9]+$/.test(lastSegment)) {
        return baseResponse;
    }

    const localePrefix = locale === config.defaultLocale ? '' : requestPrefix;
    const localeUrl = (target: string) =>
        new URL(`${localePrefix}${target === '/' ? '' : target}` || '/', request.url);

    // Emailed Firebase action links all arrive on the single project-wide
    // action URL carrying `?mode=<action>&oobCode=...`. Forward them to the
    // page for that mode BEFORE any auth/whitelist check below: these links
    // are followed by users who are typically signed OUT (a password reset,
    // or verification opened in another browser), so letting the guest
    // redirect run first would bounce them to `redirectAuthPath` and discard
    // the `oobCode` they came to spend. The whole query string is preserved
    // so the destination page still receives `oobCode`/`continueUrl`/`lang`.
    // When `actionLinkPath` is set, only requests to that exact (locale-
    // stripped) path are eligible — matches a Firebase Console action URL
    // pinned to one static path (e.g. "https://example.com/auth/action")
    // rather than the bare domain root.
    const isEligibleActionPath = !fa.actionLinkPath || path === fa.actionLinkPath;
    if (fa.actionLinkRedirectEnabled !== false && isEligibleActionPath) {
        const mode = request.nextUrl.searchParams.get('mode');
        if (mode) {
            const target = resolveActionModePaths(fa)[mode];
            // Skip when already on the destination — the forward sets the same
            // `?mode=` it matched on, so redirecting again would loop forever.
            if (target && target !== path) {
                const url = localeUrl(target);
                url.search = request.nextUrl.search;
                return buildRedirect(baseResponse, url);
            }
        }
    }

    const isWhiteListed = isWhitelisted(path, fa.whiteListPaths);
    if (isWhiteListed) return baseResponse;

    const isAuthPage = fa.isAuthPath(path);
    let token = request.cookies.get(sessionCookieName)?.value;
    let refreshedToken: { idToken: string; refreshToken: string } | null = null;
    let clearInvalidSession = false;
    // A transient refresh failure (network blip, Google 5xx, timeout) means
    // "couldn't confirm the session right now" — NOT "this user is signed
    // out". Redirecting to login in that case is the bug this guards
    // against: it signs a still-valid user out for a one-off hiccup, and
    // the client SDK (which still has a live session independent of these
    // cookies) then bounces them straight back, producing a login flash.
    let refreshWasTransientFailure = false;

    if (token && isJwtExpired(token)) {
        token = undefined;
    }

    if (!token) {
        const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            const result = await refreshIdToken(fa.apiKey, refreshToken);
            if (result.status === 'refreshed') {
                refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken };
                token = refreshedToken.idToken;
            } else if (result.status === 'invalid') {
                clearInvalidSession = true;
            } else {
                refreshWasTransientFailure = true;
            }
        } else if (request.cookies.get(sessionCookieName)) {
            clearInvalidSession = true;
        }
    }

    const hasSession = !!token;
    let response: NextResponse;

    const isVerifyEmailPage = !!fa.verifyEmailPath && path === fa.verifyEmailPath;

    // The session cookie's `email_verified` claim is only as fresh as the
    // last ID-token mint — it does NOT update the moment a user clicks an
    // emailed verification link, only once the token naturally refreshes
    // (up to ~1hr later). AuthUserProvider (client) mirrors the live SDK
    // state into `emailVerifiedHintCookieName` on every auth-state change,
    // so it reflects verification status sooner than the session JWT does.
    // Force one refresh to confirm before redirecting whenever that hint
    // can't yet vouch for this claim: it disagrees outright, or it's absent
    // (e.g. first request before the client has run at all, or a hint
    // that expired/was never set) — either way there's no positive signal
    // the claim is still accurate. Only when the hint AGREES with the claim
    // is a refresh skipped, so a genuinely unverified user with an
    // established, agreeing hint doesn't pay a refresh on every request.
    let unverifiedEmail = false;
    if (fa.verifyEmailPath && !isVerifyEmailPage && hasSession && decodeJwtPayload(token!)?.email_verified === false) {
        const hint = request.cookies.get(emailVerifiedHintCookieName)?.value;
        const hintConfirms = hint === 'false';
        if (!hintConfirms && !refreshedToken) {
            const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
            if (refreshToken) {
                const result = await refreshIdToken(fa.apiKey, refreshToken);
                if (result.status === 'refreshed') {
                    refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken };
                    token = refreshedToken.idToken;
                    unverifiedEmail = decodeJwtPayload(token)?.email_verified === false;
                } else if (result.status === 'invalid') {
                    clearInvalidSession = true;
                } else {
                    // Transient failure — can't confirm the live claim, fall
                    // back to trusting the (possibly stale) existing claim
                    // rather than blocking the request.
                    unverifiedEmail = true;
                }
            } else {
                // No refresh token to re-check with — trust the existing claim.
                unverifiedEmail = true;
            }
        } else {
            // Hint confirms unverified — no reason to refresh, trust the claim.
            unverifiedEmail = true;
        }
    }

    if (refreshWasTransientFailure) {
        // Couldn't confirm the session either way — pass through without
        // forcing a redirect in either direction. The next request (or the
        // client SDK's own session, independent of these cookies) gets a
        // chance to resolve this correctly instead of guessing wrong.
        response = baseResponse;
    } else if (!hasSession || clearInvalidSession) {
        response = isAuthPage ? baseResponse : buildRedirect(baseResponse, localeUrl(fa.redirectAuthPath));
    } else if (unverifiedEmail) {
        // Checked before the auth-page redirect: an unverified signed-in
        // user must land on verifyEmailPath even if they navigated to an
        // auth page like /login — homePath is not a state they're allowed
        // to reach yet either.
        response = buildRedirect(baseResponse, localeUrl(fa.verifyEmailPath!));
    } else if (isAuthPage || (isVerifyEmailPage && decodeJwtPayload(token!)?.email_verified === true)) {
        // A verified user has no reason to be on verifyEmailPath either —
        // same "you're done here, go home" treatment as an auth page.
        // `unverifiedEmail` can't be reused here: its own computation
        // deliberately skips verifyEmailPath (so it never redirects AWAY
        // from that page for an unverified user), so it's always `false`
        // while already on it regardless of actual verification status —
        // checking the claim again directly is what tells verified and
        // unverified apart on this specific page. Requires an EXPLICIT
        // `true` (not just "not false") — a missing/undefined claim must
        // NOT redirect home here, since `AuthUserProvider`'s client-side
        // effect treats that same user as unverified via the live SDK's
        // boolean `user.emailVerified`. The two disagreeing caused an
        // infinite client<->server redirect loop on this exact page when a
        // token's claim was merely absent rather than `false`.
        response = buildRedirect(baseResponse, localeUrl(fa.homePath));
    } else {
        response = baseResponse;
    }

    if (clearInvalidSession) {
        response.cookies.delete(sessionCookieName);
        response.cookies.delete(refreshTokenCookieName);
    }

    if (refreshedToken) {
        response.cookies.set(sessionCookieName, refreshedToken.idToken, {
            httpOnly: true,
            secure: request.nextUrl.protocol === 'https',
            sameSite: 'lax',
            path: '/',
            maxAge: fa.sessionCookieMaxAge ?? DEFAULT_SESSION_MAX_AGE,
        });
        response.cookies.set(refreshTokenCookieName, refreshedToken.refreshToken, {
            httpOnly: true,
            secure: request.nextUrl.protocol === 'https',
            sameSite: 'lax',
            path: '/',
            maxAge: fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE,
        });
    }

    return response;
}

/** A redirect response can't carry forward `baseResponse`'s rewrite/next decision, so this copies its cookies/headers across instead of dropping them. */
function buildRedirect(baseResponse: NextResponse, url: URL): NextResponse {
    const redirectResponse = NextResponse.redirect(url);
    baseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    baseResponse.headers.forEach((value, key) => redirectResponse.headers.set(key, value));
    return redirectResponse;
}

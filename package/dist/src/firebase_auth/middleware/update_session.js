import { NextResponse } from 'next/server';
import config from '@intl-config';
import decodeJwtPayload from '../decode_jwt_payload';
import isWhitelisted from '../is_whitelisted';
import withRedirectQuery from '../preserve_redirect_query';
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
function resolveActionModePaths(fa) {
    const paths = {
        resetPassword: fa.resetPasswordPath ?? defaultResetPasswordPath,
    };
    if (fa.verifyEmailPath)
        paths.verifyEmail = fa.verifyEmailPath;
    if (fa.recoverEmailPath)
        paths.recoverEmail = fa.recoverEmailPath;
    if (fa.signInPath)
        paths.signIn = fa.signInPath;
    return { ...paths, ...fa.actionModePaths };
}
export const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 5;
export const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 365;
/**
 * The session/refresh cookie attributes, shared by every writer so the
 * middleware and the RSC-side refresh can't drift into writing the same
 * cookie pair with different flags or lifetimes.
 *
 * @param secure `false` only for a plain-http local dev origin — a `secure`
 *   cookie is silently dropped there.
 */
export function sessionCookieOptions(fa, secure) {
    const shared = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
    return {
        session: { ...shared, maxAge: fa.sessionCookieMaxAge ?? DEFAULT_SESSION_MAX_AGE },
        refresh: { ...shared, maxAge: fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE },
    };
}
// Refresh slightly before the real expiry — treating a token as expired
// right up to its last second means normal clock skew or in-flight request
// time can hand a client a token that dies moments after this check, forcing
// an extra round-trip on the very next request.
const CLOCK_SKEW_MARGIN_MS = 60 * 1000;
export function isIdTokenExpired(token) {
    return isJwtExpired(token);
}
function isJwtExpired(token) {
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
const REFRESH_CACHE_TTL_SECONDS = 30 * 60;
const REFRESH_CACHE_KEY_ORIGIN = 'https://firebase-auth-refresh-cache.internal';
function getEdgeCache() {
    const cachesApi = globalThis.caches;
    return cachesApi?.default;
}
async function hashRefreshToken(refreshToken) {
    const data = new TextEncoder().encode(refreshToken);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function getCachedRefresh(refreshToken) {
    const cache = getEdgeCache();
    if (!cache)
        return null;
    try {
        const key = `${REFRESH_CACHE_KEY_ORIGIN}/${await hashRefreshToken(refreshToken)}`;
        const cached = await cache.match(key);
        if (!cached)
            return null;
        return await cached.json();
    }
    catch {
        return null;
    }
}
async function setCachedRefresh(refreshToken, refreshed) {
    const cache = getEdgeCache();
    if (!cache)
        return;
    try {
        const key = `${REFRESH_CACHE_KEY_ORIGIN}/${await hashRefreshToken(refreshToken)}`;
        await cache.put(key, new Response(JSON.stringify(refreshed), {
            headers: { 'Cache-Control': `max-age=${REFRESH_CACHE_TTL_SECONDS}` },
        }));
    }
    catch {
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
/**
 * Mints a fresh ID token from a stored refresh token via Google's Secure
 * Token API. No `firebase/auth` import: this runs in the Edge middleware
 * runtime, and `firebase/auth` pulls in Node-only APIs that break Edge
 * bundles even though this function never touches that module.
 */
export async function refreshIdToken(apiKey, refreshToken, options) {
    // `skipCache` exists for the caller that already HAS a token the Auth
    // service rejected: the cache entry is what produced that token, so a
    // normal cache hit would hand back the exact same rejected token and the
    // retry could never recover.
    const cached = options?.skipCache ? null : await getCachedRefresh(refreshToken);
    if (cached && !isJwtExpired(cached.idToken))
        return { status: 'refreshed', ...cached };
    try {
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
            cache: 'no-store',
        });
        if (!res.ok) {
            if (res.status === 400) {
                try {
                    const errorBody = await res.json();
                    if (errorBody.error?.message && INVALID_REFRESH_TOKEN_ERRORS.has(errorBody.error.message)) {
                        return { status: 'invalid' };
                    }
                }
                catch {
                    // Unparseable body on a 400 — treat as transient rather
                    // than assuming the token is invalid.
                }
            }
            return { status: 'transient-failure' };
        }
        const data = await res.json();
        const refreshed = { idToken: data.id_token, refreshToken: data.refresh_token };
        // Not awaited: the cache write is a pure optimization for FUTURE
        // requests, not this one — blocking this response on it would
        // reintroduce the exact latency this fix exists to remove.
        // setCachedRefresh already swallows its own errors, so a rejected
        // write here would otherwise surface as an unhandled rejection.
        void setCachedRefresh(refreshToken, refreshed);
        return { status: 'refreshed', ...refreshed };
    }
    catch {
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
export default async function updateSession(request, baseResponse, locale, rebuildResponse) {
    const fa = config.firebaseAuth;
    if (!fa || fa.middlewareEnabled === false)
        return baseResponse;
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
    const isPrefetch = isPrefetchRequest(request);
    const localePrefix = locale === config.defaultLocale ? '' : requestPrefix;
    const localeUrl = (target) => new URL(withRedirectQuery(`${localePrefix}${target === '/' ? '' : target}` || '/', request.nextUrl.search), request.url);
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
            let target = resolveActionModePaths(fa)[mode];
            // Already on the page this mode routes to: the link has arrived.
            // Following `continueUrl` from here would send it back to the
            // action URL, which forwards to this same target again — an
            // endless 307 ping-pong.
            if (fa.followSameOriginContinueUrl !== false && target !== path) {
                const continueUrl = request.nextUrl.searchParams.get('continueUrl');
                if (continueUrl) {
                    try {
                        const parsed = new URL(continueUrl, request.url);
                        if (parsed.origin === request.nextUrl.origin) {
                            let continuePath = parsed.pathname;
                            if (locale !== config.defaultLocale) {
                                if (continuePath.startsWith(`/${locale}/`)) {
                                    continuePath = continuePath.slice(locale.length + 1);
                                }
                                else if (continuePath === `/${locale}`) {
                                    continuePath = '/';
                                }
                            }
                            // A continueUrl pointing back at the request's own
                            // path (e.g. the single project-wide action URL
                            // echoing itself as `actionCodeSettings.url`)
                            // carries no routing information — keep the
                            // mode-derived target instead of overwriting it
                            // with a no-op.
                            if (continuePath !== '/' && continuePath !== path) {
                                target = continuePath;
                            }
                        }
                        else {
                            if (parsed.pathname === '/') {
                                if (fa.actionLinkPath) {
                                    parsed.pathname = fa.actionLinkPath;
                                }
                                else if (target) {
                                    parsed.pathname = `${localePrefix}${target}`;
                                }
                            }
                            parsed.search = request.nextUrl.search;
                            return buildRedirect(baseResponse, parsed, isPrefetch);
                        }
                    }
                    catch {
                        // Invalid continueUrl format — fall back to resolved mode target
                    }
                }
            }
            // Skip when already on the destination — the forward sets the same
            // `?mode=` it matched on, so redirecting again would loop forever.
            if (target && target !== path) {
                const url = localeUrl(target);
                url.search = request.nextUrl.search;
                // Staying on this origin: only `oobCode` (plus anything the app
                // put there itself) is still needed. Dropping Firebase's own
                // routing params keeps the landed URL clean and makes a second
                // forwarding pass impossible.
                // `signIn` is the exception: `signInWithEmailLink` re-parses
                // the landed URL and needs Firebase's own `mode`/`apiKey`
                // intact, unlike the bare-`oobCode` reset/verify flows.
                if (fa.stripActionLinkQuery !== false && mode !== 'signIn') {
                    for (const key of ['mode', 'apiKey', 'lang', 'continueUrl']) {
                        url.searchParams.delete(key);
                    }
                }
                return buildRedirect(baseResponse, url, isPrefetch);
            }
        }
    }
    const isWhiteListed = isWhitelisted(path, fa.whiteListPaths);
    if (isWhiteListed)
        return baseResponse;
    const isAuthPage = fa.isAuthPath(path);
    let token = request.cookies.get(sessionCookieName)?.value;
    let refreshedToken = null;
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
            }
            else if (result.status === 'invalid') {
                clearInvalidSession = true;
            }
            else {
                refreshWasTransientFailure = true;
            }
        }
        else if (request.cookies.get(sessionCookieName)) {
            clearInvalidSession = true;
        }
    }
    const hasSession = !!token;
    let response;
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
    // On verifyEmailPath itself the branch above deliberately never runs, so
    // a token minted before the user verified keeps the page pinned even
    // after the client has confirmed verification and mirrored it into the
    // hint cookie. Refresh once when the hint claims `true` against a stale
    // `false` claim, so the redirect-home branch below can observe it.
    if (isVerifyEmailPage && hasSession && !refreshedToken
        && decodeJwtPayload(token)?.email_verified === false
        && request.cookies.get(emailVerifiedHintCookieName)?.value === 'true') {
        const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            const result = await refreshIdToken(fa.apiKey, refreshToken);
            if (result.status === 'refreshed') {
                refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken };
                token = refreshedToken.idToken;
            }
            else if (result.status === 'invalid') {
                clearInvalidSession = true;
            }
        }
    }
    let unverifiedEmail = false;
    if (fa.verifyEmailPath && !isVerifyEmailPage && hasSession && decodeJwtPayload(token)?.email_verified === false) {
        // Sending a user to `verifyEmailPath` is only safe when this claim
        // reflects the LIVE account state, because that page resolves the
        // same user through `getAuthUser()`/`initializeServerApp` — which
        // reads the Auth service directly, not this frozen claim — and
        // redirects home the moment it sees a verified user. Any disagreement
        // between the two is therefore not a stale-data annoyance but an
        // infinite redirect loop.
        //
        // The hint cookie cannot settle that: it is a client-written mirror,
        // and after the user verifies in another tab (or the client simply
        // never re-runs) it keeps asserting a `false` that is now wrong,
        // while the Auth service already reports verified. Trusting a
        // `'false'` hint as confirmation is exactly what pinned verified
        // users in the loop. So the hint is only ever allowed to SKIP work
        // when it agrees the user is verified — never to prove they aren't.
        const hint = request.cookies.get(emailVerifiedHintCookieName)?.value;
        if (!refreshedToken) {
            const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
            if (refreshToken) {
                // `skipCache`: the cached entry is what produced the very
                // token whose claim is in question, so a cached refresh can
                // hand back that same token and confirm nothing.
                const result = await refreshIdToken(fa.apiKey, refreshToken, { skipCache: true });
                if (result.status === 'refreshed') {
                    refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken };
                    token = refreshedToken.idToken;
                    // A `true` hint means the client already observed
                    // verification live; never redirect against it, even if
                    // this mint's claim hasn't caught up.
                    unverifiedEmail = hint !== 'true' && decodeJwtPayload(token)?.email_verified === false;
                }
                else if (result.status === 'invalid') {
                    clearInvalidSession = true;
                }
                else {
                    // Transient failure — can't confirm the live claim, fall
                    // back to trusting the (possibly stale) existing claim
                    // rather than blocking the request.
                    unverifiedEmail = true;
                }
            }
            else {
                // No refresh token to re-check with — trust the existing claim.
                unverifiedEmail = true;
            }
        }
        else {
            unverifiedEmail = hint !== 'true' && decodeJwtPayload(token)?.email_verified === false;
        }
    }
    if (refreshWasTransientFailure) {
        // Couldn't confirm the session either way — pass through without
        // forcing a redirect in either direction. The next request (or the
        // client SDK's own session, independent of these cookies) gets a
        // chance to resolve this correctly instead of guessing wrong.
        response = baseResponse;
    }
    else if (!hasSession || clearInvalidSession) {
        response = isAuthPage ? baseResponse : buildRedirect(baseResponse, localeUrl(fa.redirectAuthPath), isPrefetch);
    }
    else if (unverifiedEmail) {
        // Checked before the auth-page redirect: an unverified signed-in
        // user must land on verifyEmailPath even if they navigated to an
        // auth page like /login — homePath is not a state they're allowed
        // to reach yet either.
        response = buildRedirect(baseResponse, localeUrl(fa.verifyEmailPath), isPrefetch);
    }
    else if (isAuthPage || (isVerifyEmailPage && decodeJwtPayload(token)?.email_verified === true)) {
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
        response = buildRedirect(baseResponse, localeUrl(fa.homePath), isPrefetch);
    }
    else {
        response = baseResponse;
    }
    if (clearInvalidSession) {
        response.cookies.delete(sessionCookieName);
        response.cookies.delete(refreshTokenCookieName);
    }
    if (refreshedToken) {
        // `response.cookies.set` only reaches the BROWSER — the current
        // render still reads the old, expired token from `cookies()`, so
        // `initializeServerApp` rejects it with `auth/invalid-user-token`.
        // Writing to `request.cookies` and rebuilding the pass-through
        // response from that request makes the fresh token visible to this
        // render too.
        request.cookies.set(sessionCookieName, refreshedToken.idToken);
        request.cookies.set(refreshTokenCookieName, refreshedToken.refreshToken);
        if (rebuildResponse && response === baseResponse) {
            const rebuilt = rebuildResponse(request);
            baseResponse.cookies.getAll().forEach((cookie) => rebuilt.cookies.set(cookie));
            baseResponse.headers.forEach((value, key) => rebuilt.headers.set(key, value));
            response = rebuilt;
        }
        const cookieOptions = sessionCookieOptions(fa, request.nextUrl.protocol === 'https');
        response.cookies.set(sessionCookieName, refreshedToken.idToken, cookieOptions.session);
        response.cookies.set(refreshTokenCookieName, refreshedToken.refreshToken, cookieOptions.refresh);
    }
    return response;
}
/** A redirect response can't carry forward `baseResponse`'s rewrite/next decision, so this copies its cookies/headers across instead of dropping them. */
// A router prefetch must never be answered with a redirect. Next's segment
// cache stores the entry under the REQUESTED url while `fetch` transparently
// follows the 3xx, so the entry it caches describes a different route than the
// key it is filed under; the router then keeps re-requesting it, which
// re-redirects, an unbounded prefetch loop that hammers the origin (every
// signed-out page carrying a `<Link>` to a guarded route reproduced it).
// An empty 204 is treated as an un-cacheable prefetch miss instead: the router
// backs off, and the guard still runs in full on the real navigation, which
// is never a prefetch.
function isPrefetchRequest(request) {
    return request.headers.get('next-router-prefetch') === '1'
        || request.headers.get('purpose') === 'prefetch'
        || request.headers.get('x-purpose') === 'prefetch';
}
function buildRedirect(baseResponse, url, isPrefetch = false) {
    if (isPrefetch) {
        return new NextResponse(null, {
            status: 204,
            headers: { 'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate' },
        });
    }
    const redirectResponse = NextResponse.redirect(url);
    baseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    baseResponse.headers.forEach((value, key) => redirectResponse.headers.set(key, value));
    // Explicitly prevent OpenNext/Cloudflare from caching these auth redirects.
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    return redirectResponse;
}

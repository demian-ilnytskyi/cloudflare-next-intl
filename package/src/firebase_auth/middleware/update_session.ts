import { NextResponse, type NextRequest } from 'next/server';
import config from '@intl-config';

export const defaultSessionCookieName = '__fa_session__';
export const defaultRefreshTokenCookieName = '__fa_refresh_token__';

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 5;
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 365;

// Refresh slightly before the real expiry — treating a token as expired
// right up to its last second means normal clock skew or in-flight request
// time can hand a client a token that dies moments after this check, forcing
// an extra round-trip on the very next request.
const CLOCK_SKEW_MARGIN_MS = 60 * 1000;

function isJwtExpired(token: string): boolean {
    try {
        const payload = token.split('.')[1];
        const { exp } = JSON.parse(atob(payload.replace(/[-_]/g, (c) => c === '-' ? '+' : '/'))) as { exp?: number };
        return !exp || exp * 1000 - CLOCK_SKEW_MARGIN_MS <= Date.now();
    } catch {
        return true;
    }
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

    const rawPath = request.nextUrl.pathname;
    const requestPrefix = `/${locale}`;
    const path = rawPath === requestPrefix || rawPath.startsWith(`${requestPrefix}/`)
        ? rawPath.slice(requestPrefix.length) || '/'
        : rawPath;

    const lastSegment = rawPath.slice(rawPath.lastIndexOf('/') + 1);
    if (rawPath.startsWith('/_next') || /\.[a-zA-Z0-9]+$/.test(lastSegment)) {
        return baseResponse;
    }

    const localePrefix = locale === config.locales[0] ? '' : requestPrefix;
    const localeUrl = (target: string) =>
        new URL(`${localePrefix}${target === '/' ? '' : target}` || '/', request.url);

    const isWhiteListed = fa.whiteListPaths?.includes(path) ?? false;
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

    if (refreshWasTransientFailure) {
        // Couldn't confirm the session either way — pass through without
        // forcing a redirect in either direction. The next request (or the
        // client SDK's own session, independent of these cookies) gets a
        // chance to resolve this correctly instead of guessing wrong.
        response = baseResponse;
    } else if (!hasSession) {
        response = isAuthPage ? baseResponse : buildRedirect(baseResponse, localeUrl(fa.redirectAuthPath));
    } else if (isAuthPage) {
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
            // Not httpOnly: the client provider also writes this cookie
            // directly (via document.cookie) after `getIdToken(true)`, so it
            // must stay client-writable — a JS cookie write can never carry
            // httpOnly anyway, and two same-name cookies with conflicting
            // flags is what actually caused ambiguity here.
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

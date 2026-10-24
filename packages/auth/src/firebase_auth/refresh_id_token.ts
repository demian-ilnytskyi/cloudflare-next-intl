import decodeJwtPayload from './decode_jwt_payload.js';

const CLOCK_SKEW_MARGIN_MS = 60 * 1000;

export function isTokenExpired(decoded: ReturnType<typeof decodeJwtPayload>): boolean {
    return !decoded?.exp || decoded.exp * 1000 - CLOCK_SKEW_MARGIN_MS <= Date.now();
}

export function isJwtExpired(token: string): boolean {
    return isTokenExpired(decodeJwtPayload(token));
}

export function isIdTokenExpired(token: string): boolean {
    return isJwtExpired(token);
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

export type RefreshResult =
    | { status: 'refreshed'; idToken: string; refreshToken: string }
    | { status: 'invalid' }
    | { status: 'transient-failure' };

/**
 * Mints a fresh ID token from a stored refresh token via Google's Secure
 * Token API. No `firebase/auth` import: runs in Edge middleware.
 */
export async function refreshIdToken(
    apiKey: string,
    refreshToken: string,
    options?: { skipCache?: boolean },
): Promise<RefreshResult> {
    // `skipCache` exists for the caller that already HAS a token the Auth
    // service rejected: the cache entry is what produced that token, so a
    // normal cache hit would hand back the exact same rejected token and the
    // retry could never recover.
    const cached = options?.skipCache ? null : await getCachedRefresh(refreshToken);
    if (cached && !isJwtExpired(cached.idToken)) return { status: 'refreshed', ...cached };

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

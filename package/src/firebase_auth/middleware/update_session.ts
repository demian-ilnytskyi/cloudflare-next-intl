import { NextResponse, type NextRequest } from 'next/server';
import config from '@intl-config';

export const sessionCookieName = '__fa_session__';
export const refreshTokenCookieName = '__fa_refresh_token__';

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 5;
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Mints a fresh ID token from a stored refresh token via Google's Secure
 * Token API. No `firebase/auth` import: this runs in the Edge middleware
 * runtime, and `firebase/auth` pulls in Node-only APIs that break Edge
 * bundles even though this function never touches that module.
 */
function isJwtExpired(token: string): boolean {
    try {
        const payload = token.split('.')[1];
        const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
        return !exp || exp * 1000 <= Date.now();
    } catch {
        return true;
    }
}

async function refreshIdToken(apiKey: string, refreshToken: string): Promise<{ idToken: string; refreshToken: string } | null> {
    try {
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        });

        if (!res.ok) return null;

        const data = await res.json() as { id_token: string; refresh_token: string };
        return { idToken: data.id_token, refreshToken: data.refresh_token };
    } catch {
        return null;
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

    if (token && isJwtExpired(token)) {
        token = undefined;
    }

    if (!token) {
        const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            refreshedToken = await refreshIdToken(fa.apiKey, refreshToken);
            if (refreshedToken) {
                token = refreshedToken.idToken;
            } else {
                clearInvalidSession = true;
            }
        } else if (request.cookies.get(sessionCookieName)) {
            clearInvalidSession = true;
        }
    }

    const hasSession = !!token;
    let response: NextResponse;

    if (!hasSession) {
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

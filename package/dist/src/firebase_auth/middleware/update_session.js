import { NextResponse } from 'next/server';
import config from '@intl-config';
import decodeJwtPayload from '../decode_jwt_payload.js';
import isWhitelisted from '../is_whitelisted.js';
import withRedirectQuery from '../preserve_redirect_query.js';
export const defaultSessionCookieName = '__fa_session__';
export const defaultRefreshTokenCookieName = '__fa_refresh_token__';
export const defaultEmailVerifiedHintCookieName = '__fa_email_verified_hint__';
export const defaultAppCheckTokenCookieName = '__fa_app_check_token__';
export const defaultResetPasswordPath = '/reset-password';
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
export function sessionCookieOptions(fa, secure) {
    const shared = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
    return {
        session: { ...shared, maxAge: fa.sessionCookieMaxAge ?? DEFAULT_SESSION_MAX_AGE },
        refresh: { ...shared, maxAge: fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE },
    };
}
const CLOCK_SKEW_MARGIN_MS = 60 * 1000;
export function isIdTokenExpired(token) {
    return isJwtExpired(token);
}
function isJwtExpired(token) {
    const decoded = decodeJwtPayload(token);
    return !decoded?.exp || decoded.exp * 1000 - CLOCK_SKEW_MARGIN_MS <= Date.now();
}
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
    }
}
const INVALID_REFRESH_TOKEN_ERRORS = new Set([
    'INVALID_REFRESH_TOKEN',
    'TOKEN_EXPIRED',
    'USER_DISABLED',
    'USER_NOT_FOUND',
]);
export async function refreshIdToken(apiKey, refreshToken, options) {
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
                }
            }
            return { status: 'transient-failure' };
        }
        const data = await res.json();
        const refreshed = { idToken: data.id_token, refreshToken: data.refresh_token };
        void setCachedRefresh(refreshToken, refreshed);
        return { status: 'refreshed', ...refreshed };
    }
    catch {
        return { status: 'transient-failure' };
    }
}
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
    const isEligibleActionPath = !fa.actionLinkPath || path === fa.actionLinkPath;
    if (fa.actionLinkRedirectEnabled !== false && isEligibleActionPath) {
        const mode = request.nextUrl.searchParams.get('mode');
        if (mode) {
            let target = resolveActionModePaths(fa)[mode];
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
                    }
                }
            }
            if (target && target !== path) {
                const url = localeUrl(target);
                url.search = request.nextUrl.search;
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
        const hint = request.cookies.get(emailVerifiedHintCookieName)?.value;
        if (!refreshedToken) {
            const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
            if (refreshToken) {
                const result = await refreshIdToken(fa.apiKey, refreshToken, { skipCache: true });
                if (result.status === 'refreshed') {
                    refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken };
                    token = refreshedToken.idToken;
                    unverifiedEmail = hint !== 'true' && decodeJwtPayload(token)?.email_verified === false;
                }
                else if (result.status === 'invalid') {
                    clearInvalidSession = true;
                }
                else {
                    unverifiedEmail = true;
                }
            }
            else {
                unverifiedEmail = true;
            }
        }
        else {
            unverifiedEmail = hint !== 'true' && decodeJwtPayload(token)?.email_verified === false;
        }
    }
    if (refreshWasTransientFailure) {
        response = baseResponse;
    }
    else if (!hasSession || clearInvalidSession) {
        response = isAuthPage ? baseResponse : buildRedirect(baseResponse, localeUrl(fa.redirectAuthPath), isPrefetch);
    }
    else if (unverifiedEmail) {
        response = buildRedirect(baseResponse, localeUrl(fa.verifyEmailPath), isPrefetch);
    }
    else if (isAuthPage || (isVerifyEmailPage && decodeJwtPayload(token)?.email_verified === true)) {
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
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    return redirectResponse;
}

import { NextResponse } from 'next/server';
import { languageDetecotr } from '../server/functions/get_user_locale.js';
import config from './intl_config.js';
import { isBotCookieKey, localeCookieName } from './cookie_key.js';
import { cache } from 'react';
import reportError from '../error_handling/report_error.js';
const sameSite = false;
const defaultCookieOption = {
    path: '/', // Cookie is valid for the entire domain
    maxAge: 2592000, // Store cookie for 30 days (in seconds).
    httpOnly: false,
    secure: false, // Send cookie only over HTTPS in production
    sameSite: sameSite, // Protection against CSRF attacks. 'strict' or 'lax' are good choices.
};
let userAgentModule;
async function getIsBotValue(userAgent) {
    if (userAgent === null)
        return false;
    if (!userAgentModule) {
        userAgentModule = await import('next/dist/server/web/spec-extension/user-agent');
    }
    // Unreachable: userAgent is already narrowed to non-null string above,
    // so the ?? '' fallback never triggers.
    return userAgentModule.isBot(userAgent ?? '');
}
const getIsBotValueCache = cache(getIsBotValue);
export const localesSet = new Set(config.locales);
// Memoized after the first call — `import()` is not free even when the
// module is already in the runtime's module cache (a microtask round-trip
// plus a Promise allocation), and this middleware runs on every request.
// Still fully lazy: consumers who never set `config.firebaseAuth` never
// reach the branch that assigns this, so they never pay the import at all.
let updateSessionModule;
/**
 * This middleware function runs for every incoming request. Handles locale
 * detection/routing, then optionally defers to your own custom logic.
 *
 * @param request The incoming request (pass through from your `middleware.ts`).
 * @param options.middlewareHandler  Your own logic (auth, feature flags, etc.),
 *   run alongside locale routing — see {@link MiddlewareCustomHandler} for the
 *   full contract (`rewriteUrl` / `redirectUrl` and what to return).
 * @param options.runHandlerOnRedirect  By default, `middlewareHandler` does
 *   NOT run for the locale-redirect case (so it never receives a
 *   `redirectUrl`). Set to `true` to also run it on redirects.
 *   Defaults to `false`.
 */
export default async function intlMiddleware(request, options) {
    try {
        let initialChosenLocale;
        const existingLocaleCookie = request.cookies.get(localeCookieName)?.value;
        let isSEOBot = undefined;
        // 1. The most performant step: Check if a locale cookie is already set
        // Also, verify if the value from this cookie is actually supported
        if (existingLocaleCookie && localesSet.has(existingLocaleCookie)) {
            initialChosenLocale = existingLocaleCookie;
        }
        else {
            const userAgent = request.headers.get('user-agent');
            isSEOBot = await getIsBotValueCache(userAgent);
            initialChosenLocale = isSEOBot ? config.defaultLocale : languageDetecotr(request.headers.get('accept-language'));
        }
        const { pathname, search, hash } = request.nextUrl;
        let urlLocale;
        let pathWithoutLocale;
        // Avoids split('/').filter(Boolean) array allocation on every request:
        // scan for the first segment's bounds directly. Unreachable:
        // Next.js guarantees pathname always starts with '/', so the else
        // branch (segmentStart = 0) never runs.
        const segmentStart = pathname.charCodeAt(0) === 47 /* '/' */ ? 1 : 0;
        let segmentEnd = pathname.indexOf('/', segmentStart);
        if (segmentEnd === -1)
            segmentEnd = pathname.length;
        const languageValue = pathname.slice(segmentStart, segmentEnd);
        // Check if the first segment of the path is one of the supported locales
        if (languageValue && localesSet.has(languageValue)) {
            urlLocale = languageValue;
            let rest = pathname.slice(segmentEnd);
            if (rest.endsWith('/'))
                rest = rest.slice(0, -1);
            if (rest.includes('//')) {
                rest = '/' + rest.split('/').filter(Boolean).join('/');
            }
            pathWithoutLocale = rest || '/';
        }
        else {
            // No locale prefix in the URL. The actual pathname is the full original pathname.
            pathWithoutLocale = pathname;
        }
        const effectiveLocaleForRequest = urlLocale ?? initialChosenLocale;
        const country = request.cf?.country ?? request.headers.get('cf-ipcountry') ?? request.headers.get('x-cf-country');
        if (country) {
            request.headers.set('x-cf-country', country);
        }
        const timezone = request.cf?.timezone ?? request.headers.get('cf-timezone') ?? request.headers.get('x-cf-timezone');
        if (timezone) {
            request.headers.set('x-cf-timezone', timezone);
        }
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-pathname', pathWithoutLocale);
        requestHeaders.set('x-search', search);
        if (country) {
            requestHeaders.set('x-cf-country', country);
        }
        if (timezone) {
            requestHeaders.set('x-cf-timezone', timezone);
        }
        let response;
        let isRedirect = false;
        let rewriteUrl;
        let redirectUrl;
        if (!urlLocale) {
            const targetPath = `/${effectiveLocaleForRequest}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`;
            const localeUrl = new URL(`${targetPath}${search}${hash}`, request.url);
            if (initialChosenLocale === config.defaultLocale) {
                rewriteUrl = localeUrl;
                response = NextResponse.rewrite(localeUrl, { request: { headers: requestHeaders } });
            }
            else {
                isRedirect = true;
                redirectUrl = localeUrl;
                response = NextResponse.redirect(localeUrl, request);
            }
        }
        else {
            response = NextResponse.next({
                request: {
                    headers: requestHeaders,
                },
            });
        }
        if (options?.middlewareHandler && (!isRedirect || options.runHandlerOnRedirect)) {
            const customResponse = await options.middlewareHandler(effectiveLocaleForRequest, rewriteUrl, redirectUrl);
            if (customResponse) {
                response = customResponse;
            }
        }
        if (!existingLocaleCookie ||
            existingLocaleCookie !== effectiveLocaleForRequest) {
            response.cookies.set(localeCookieName, effectiveLocaleForRequest, defaultCookieOption);
            if (isSEOBot !== undefined) {
                response.cookies.set(isBotCookieKey, isSEOBot.toString(), {
                    ...defaultCookieOption,
                    maxAge: 31536000, // 1 year
                    secure: process.env.NODE_ENV === 'production',
                    httpOnly: true,
                });
            }
        }
        response.headers.set('Content-Language', effectiveLocaleForRequest);
        response.headers.set('x-pathname', pathWithoutLocale);
        response.headers.set('x-search', search);
        if (country) {
            response.headers.set('x-cf-country', country);
        }
        if (timezone) {
            response.headers.set('x-cf-timezone', timezone);
        }
        // Auto-wires the firebase_auth submodule's redirect/session-refresh
        // logic when `firebaseAuth` is configured — dynamic import so this
        // file never pulls in firebase_auth/** (and transitively firebase/*)
        // for consumers who never set `firebaseAuth` at all. Runs last, so
        // it composes onto (rather than discards) the locale cookie, bot
        // cookie, and Content-Language header already finalized above.
        // Skipped entirely when a locale redirect is already happening
        // (`isRedirect`) — the locale redirect itself is the response, same
        // as `middlewareHandler` is also skipped on this path by default.
        if (!isRedirect && config.firebaseAuth && config.firebaseAuth.middlewareEnabled !== false) {
            if (!updateSessionModule) {
                updateSessionModule = await import('../firebase_auth/middleware/update_session.js');
            }
            response = await updateSessionModule.default(request, response, effectiveLocaleForRequest, (refreshedRequest) => rewriteUrl
                ? NextResponse.rewrite(rewriteUrl, { request: refreshedRequest })
                : NextResponse.next({ request: refreshedRequest }));
        }
        return response;
    }
    catch (e) {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, {
            error: e,
            classOrMethodName: 'intlMiddleware',
        });
        return NextResponse.next({
            request,
        });
    }
}

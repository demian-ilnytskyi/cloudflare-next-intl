import { NextResponse } from 'next/server';
import { languageDetecotr } from '../server/functions/get_user_locale.js';
import config from './intl_config.js';
import { isBotCookieKey, localeCookieName } from './cookie_key.js';
import { cache } from 'react';
import reportError from '../error_handling/report_error.js';
const sameSite = false;
const defaultCookieOption = {
    path: '/',
    maxAge: 2592000,
    httpOnly: false,
    secure: false,
    sameSite: sameSite,
};
let userAgentModule;
async function getIsBotValue(userAgent) {
    if (userAgent === null)
        return false;
    if (!userAgentModule) {
        userAgentModule = await import('next/dist/server/web/spec-extension/user-agent');
    }
    return userAgentModule.isBot(userAgent ?? '');
}
const getIsBotValueCache = cache(getIsBotValue);
export const localesSet = new Set(config.locales);
let updateSessionModule;
export default async function intlMiddleware(request, options) {
    try {
        let initialChosenLocale;
        const existingLocaleCookie = request.cookies.get(localeCookieName)?.value;
        let isSEOBot = undefined;
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
        const segmentStart = pathname.charCodeAt(0) === 47 ? 1 : 0;
        let segmentEnd = pathname.indexOf('/', segmentStart);
        if (segmentEnd === -1)
            segmentEnd = pathname.length;
        const languageValue = pathname.slice(segmentStart, segmentEnd);
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
                    maxAge: 31536000,
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

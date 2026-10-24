import type { NextRequest } from 'next/server.js';
import { NextResponse } from 'next/server.js';
import { languageDetecotr } from '../server/functions/get_user_locale.js';
import type { CookieAttributes, MiddlewareCustomHandler } from '../types/types.js';
import config from './intl_config.js';
import { countryCookieKey, isBotCookieKey, localeCookieName, timezoneCookieKey } from './cookie_key.js';
import { cache } from 'react';
import reportIntlError from '../general/report_intl_error.js';
import type * as UserAgentModule from 'next/dist/server/web/spec-extension/user-agent';
import { defaultCountryHeaderNames, defaultTimezoneHeaderNames } from '../server/functions/geo.js';

export interface IntlMiddlewareContext {
    request: NextRequest;
    locale: string;
    next: (refreshedRequest: NextRequest) => NextResponse;
}

export type IntlMiddlewareHook = (
    response: NextResponse,
    ctx: IntlMiddlewareContext,
) => Promise<NextResponse>;

const sameSite: true | false | "lax" | "strict" | "none" | undefined = false;

const defaultCookieOption: CookieAttributes = {
    path: '/', // Cookie is valid for the entire domain
    maxAge: 2592000, // Store cookie for 30 days (in seconds).
    httpOnly: false,
    secure: false, // Send cookie only over HTTPS in production
    sameSite: sameSite, // Protection against CSRF attacks. 'strict' or 'lax' are good choices.
};

let userAgentModule: typeof UserAgentModule | undefined;

async function getIsBotValue(userAgent: string | null): Promise<boolean> {
    if (userAgent === null) return false;
    if (!userAgentModule) {
        userAgentModule = await import('next/dist/server/web/spec-extension/user-agent');
    }
    return userAgentModule.isBot(userAgent);
}

const getIsBotValueCache = cache(getIsBotValue);

export const localesSet = new Set(config.locales);

function getFirstHeaderValue(headers: Headers, names: readonly string[]): string | undefined {
    for (const name of names) {
        const value = headers.get(name);
        if (value) return value;
    }
    return undefined;
}

export function createIntlMiddleware(middlewareOptions?: {
    afterResponse?: IntlMiddlewareHook;
}): (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: any,
    options?: { middlewareHandler?: MiddlewareCustomHandler; runHandlerOnRedirect?: boolean },
) => Promise<NextResponse> {
    return async function intlMiddleware(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        request: any,
        options?: { middlewareHandler?: MiddlewareCustomHandler; runHandlerOnRedirect?: boolean },
    ): Promise<NextResponse<unknown>> {
        try {
            let initialChosenLocale: string;
            const existingLocaleCookie = request.cookies.get(localeCookieName)?.value;

            let isSEOBot: boolean | undefined = undefined;

            if (existingLocaleCookie && localesSet.has(existingLocaleCookie)) {
                initialChosenLocale = existingLocaleCookie;
            } else {
                const userAgent = request.headers.get('user-agent');
                isSEOBot = await getIsBotValueCache(userAgent);
                initialChosenLocale = isSEOBot ? config.defaultLocale : languageDetecotr(
                    request.headers.get('accept-language'),
                );
            }

            const { pathname, search, hash } = request.nextUrl;

            let urlLocale: string | undefined;
            let pathWithoutLocale: string;

            const segmentStart = pathname.charCodeAt(0) === 47 /* '/' */ ? 1 : 0;
            let segmentEnd = pathname.indexOf('/', segmentStart);
            if (segmentEnd === -1) segmentEnd = pathname.length;
            const languageValue = pathname.slice(segmentStart, segmentEnd);

            if (languageValue && localesSet.has(languageValue)) {
                urlLocale = languageValue;
                let rest = pathname.slice(segmentEnd);
                if (rest.endsWith('/')) rest = rest.slice(0, -1);
                if (rest.includes('//')) {
                    rest = '/' + rest.split('/').filter(Boolean).join('/');
                }
                pathWithoutLocale = rest || '/';
            } else {
                pathWithoutLocale = pathname;
            }

            const effectiveLocaleForRequest = urlLocale ?? initialChosenLocale;

            const cf = (request as unknown as { cf?: { country?: string; timezone?: string } }).cf;
            const countryHeaderNames = config.generate?.countryHeaderNames
                ?? defaultCountryHeaderNames;
            const timezoneHeaderNames = config.generate?.timezoneHeaderNames
                ?? defaultTimezoneHeaderNames;
            const countryCookieName = config.generate?.countryCookieName
                ?? countryCookieKey;
            const timezoneCookieName = config.generate?.timezoneCookieName
                ?? timezoneCookieKey;
            const country = cf?.country || getFirstHeaderValue(request.headers, countryHeaderNames);
            const timezone = cf?.timezone || getFirstHeaderValue(request.headers, timezoneHeaderNames);

            const requestHeaders = new Headers(request.headers);
            requestHeaders.set('x-pathname', pathWithoutLocale);
            requestHeaders.set('x-search', search);
            if (country) {
                requestHeaders.set('x-cf-country', country);
            }
            if (timezone) {
                requestHeaders.set('x-cf-timezone', timezone);
            }

            let response: NextResponse;
            let isRedirect = false;
            let rewriteUrl: URL | undefined;
            let redirectUrl: URL | undefined;

            if (!urlLocale) {
                const targetPath = `/${effectiveLocaleForRequest}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`;
                const localeUrl = new URL(`${targetPath}${search}${hash}`, request.url);
                if (initialChosenLocale === config.defaultLocale) {
                    rewriteUrl = localeUrl;
                    response = NextResponse.rewrite(localeUrl, { request: { headers: requestHeaders } });
                } else {
                    isRedirect = true;
                    redirectUrl = localeUrl;
                    response = NextResponse.redirect(localeUrl, request);
                }
            } else {
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
                response.cookies.set(countryCookieName, country, {
                    path: '/',
                    maxAge: 86400,
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                });
            }

            if (timezone) {
                response.headers.set('x-cf-timezone', timezone);
                response.cookies.set(timezoneCookieName, timezone, {
                    path: '/',
                    maxAge: 86400,
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                });
            }

            if (!isRedirect && middlewareOptions?.afterResponse) {
                response = await middlewareOptions.afterResponse(response, {
                    request,
                    locale: effectiveLocaleForRequest,
                    next: (refreshedRequest) => rewriteUrl
                        ? NextResponse.rewrite(rewriteUrl, { request: refreshedRequest })
                        : NextResponse.next({ request: refreshedRequest }),
                });
            }

            return response;
        } catch (e) {
            reportIntlError(e, 'intlMiddleware');
            return NextResponse.next({
                request,
            });
        }
    };
}

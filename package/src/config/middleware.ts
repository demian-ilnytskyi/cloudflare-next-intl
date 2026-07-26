import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { languageDetecotr } from '../server/functions/get_user_locale';
import type { CookieAttributes, MiddlewareCustomHandler } from '../types/types';
import config from './intl_config';
import { isBotCookieKey, localeCookieName } from './cookie_key';
import { cache } from 'react';

const sameSite: true | false | "lax" | "strict" | "none" | undefined = false;

const defaultCookieOption: CookieAttributes = {
    path: '/', // Cookie is valid for the entire domain
    maxAge: 2592000, // Store cookie for 30 days (in seconds).
    httpOnly: false,
    secure: false, // Send cookie only over HTTPS in production
    sameSite: sameSite, // Protection against CSRF attacks. 'strict' or 'lax' are good choices.
};

async function getIsBotValue(userAgent: string | null): Promise<boolean> {
    if (userAgent === null) return false;
    const { isBot } = await import('next/dist/server/web/spec-extension/user-agent');
    return isBot(userAgent ?? '');
}

const getIsBotValueCache = cache(getIsBotValue);

export const localesSet = new Set(config.locales);

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
export default async function intlMiddleware(
    request: NextRequest,
    options?: { middlewareHandler?: MiddlewareCustomHandler; runHandlerOnRedirect?: boolean },
): Promise<NextResponse<unknown>> {
    try {
        let initialChosenLocale: string;
        const existingLocaleCookie = request.cookies.get(localeCookieName)?.value;

        let isSEOBot: boolean | undefined = undefined;

        // 1. The most performant step: Check if a locale cookie is already set
        // Also, verify if the value from this cookie is actually supported
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

        const pathSegments = pathname.split('/').filter(Boolean); // e.g., ['', 'en', 'about'] -> ['en', 'about']
        const firstSegment = pathSegments[0];
        const languageValue = firstSegment;

        // Check if the first segment of the path is one of the supported locales
        if (pathSegments.length > 0 && localesSet.has(languageValue)) {
            urlLocale = languageValue;
            pathWithoutLocale = '/' + pathSegments.slice(1).join('/'); // Remove the locale segment
            if (pathWithoutLocale === '') pathWithoutLocale = '/'; // Ensure it's '/' for root after removing locale
        } else {
            // No locale prefix in the URL. The actual pathname is the full original pathname.
            pathWithoutLocale = pathname;
        }

        const effectiveLocaleForRequest = urlLocale ?? initialChosenLocale;

        let response: NextResponse;
        let isRedirect = false;
        let rewriteUrl: URL | undefined;
        let redirectUrl: URL | undefined;

        if (!urlLocale) {
            const targetPath = `/${effectiveLocaleForRequest}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`;
            const localeUrl = new URL(`${targetPath}${search}${hash}`, request.url);
            if (initialChosenLocale === config.defaultLocale) {
                rewriteUrl = localeUrl;
                response = NextResponse.rewrite(localeUrl, { request });
            } else {
                isRedirect = true;
                redirectUrl = localeUrl;
                response = NextResponse.redirect(localeUrl, request,);
            }
        } else {
            response = NextResponse.next({
                request,
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

        return response;
    } catch (e) {
        console.error(`Middleware Error ${e}`);
        return NextResponse.next({
            request,
        });
    }
}

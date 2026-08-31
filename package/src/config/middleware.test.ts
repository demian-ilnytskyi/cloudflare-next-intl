// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import intlMiddleware from './middleware.js';
import { makeTestRequest as makeRequest } from '../test_utils/mock_next_server.js';

describe('intlMiddleware', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('uses the existing locale cookie when valid', async () => {
        const req = makeRequest('https://example.com/about', { cookies: { __user_locale_key__: 'de' } });
        const res = await intlMiddleware(req);
        expect(res.headers.get('Content-Language')).toBe('de');
    });

    it('ignores an existing cookie with an unsupported locale and re-detects', async () => {
        const req = makeRequest('https://example.com/about', { cookies: { __user_locale_key__: 'xx' } });
        const res = await intlMiddleware(req);
        expect(res.headers.get('Content-Language')).toBe('en');
    });

    it('detects locale from accept-language header when no cookie is set', async () => {
        const req = makeRequest('https://example.com/about', {
            headers: { 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' },
        });
        const res = await intlMiddleware(req);
        expect(res.headers.get('Content-Language')).toBe('de');
    });

    it('serves the default locale to a detected SEO bot regardless of accept-language', async () => {
        const req = makeRequest('https://example.com/about', {
            headers: {
                'accept-language': 'de-DE,de;q=0.9',
                'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
            },
        });
        const res = await intlMiddleware(req);
        expect(res.headers.get('Content-Language')).toBe('en');
        expect(res.cookies.get('__is_bot_key__')?.value).toBe('true');
    });

    it('rewrites (not redirects) when resolved locale is the default and URL has no locale prefix', async () => {
        const req = makeRequest('https://example.com/about');
        const res = await intlMiddleware(req);
        expect(res.headers.get('Content-Language')).toBe('en');
        expect(res.headers.get('x-middleware-rewrite')).toContain('/en/about');
    });

    it('redirects when resolved locale is non-default and URL has no locale prefix', async () => {
        const req = makeRequest('https://example.com/about', {
            headers: { 'accept-language': 'de' },
        });
        const res = await intlMiddleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/de/about');
    });

    it('passes through with NextResponse.next when the URL already has a valid locale prefix', async () => {
        const req = makeRequest('https://example.com/de/about');
        const res = await intlMiddleware(req);
        expect(res.headers.get('Content-Language')).toBe('de');
    });

    it('invokes middlewareHandler on a rewrite (non-redirect) path', async () => {
        const req = makeRequest('https://example.com/about');
        const handler = vi.fn().mockReturnValue(null);
        await intlMiddleware(req, { middlewareHandler: handler });
        expect(handler).toHaveBeenCalledWith('en', expect.any(URL), undefined);
    });

    it('does NOT invoke middlewareHandler on a redirect path by default', async () => {
        const req = makeRequest('https://example.com/about', { headers: { 'accept-language': 'de' } });
        const handler = vi.fn().mockReturnValue(null);
        await intlMiddleware(req, { middlewareHandler: handler });
        expect(handler).not.toHaveBeenCalled();
    });

    it('invokes middlewareHandler on a redirect path when runHandlerOnRedirect is true', async () => {
        const req = makeRequest('https://example.com/about', { headers: { 'accept-language': 'de' } });
        const handler = vi.fn().mockReturnValue(null);
        await intlMiddleware(req, { middlewareHandler: handler, runHandlerOnRedirect: true });
        expect(handler).toHaveBeenCalledWith('de', undefined, expect.any(URL));
    });

    it('uses the response returned by middlewareHandler when non-null', async () => {
        const req = makeRequest('https://example.com/de/about');
        const custom = NextResponse.json({ custom: true });
        const handler = vi.fn().mockReturnValue(custom);
        const res = await intlMiddleware(req, { middlewareHandler: handler });
        expect(await res.json()).toEqual({ custom: true });
    });

    it('falls back to the default response when middlewareHandler returns null', async () => {
        const req = makeRequest('https://example.com/de/about');
        const handler = vi.fn().mockReturnValue(null);
        const res = await intlMiddleware(req, { middlewareHandler: handler });
        expect(res.headers.get('Content-Language')).toBe('de');
    });

    it('does not re-set the locale cookie when it already matches', async () => {
        const req = makeRequest('https://example.com/de/about', { cookies: { __user_locale_key__: 'de' } });
        const res = await intlMiddleware(req);
        // Cookie is not re-set since the existing cookie already matches the resolved locale
        const setCookieHeader = res.cookies.get('__user_locale_key__');
        expect(setCookieHeader).toBeUndefined();
    });

    it('redirects to the bare locale root (no trailing path segment) when at "/"', async () => {
        const req = makeRequest('https://example.com/', {
            headers: { 'accept-language': 'de' },
        });
        const res = await intlMiddleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/de');
    });

    it('sets x-pathname to "/" for the bare locale-prefixed root', async () => {
        const req = makeRequest('https://example.com/de');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-pathname')).toBe('/');
    });

    it('sets x-search to the request query string', async () => {
        const req = makeRequest('https://example.com/de/blog?test=test&a=b');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-search')).toBe('?test=test&a=b');
    });

    it('sets x-search to an empty string when there is no query string', async () => {
        const req = makeRequest('https://example.com/de/blog');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-search')).toBe('');
    });

    it('sets x-pathname to the remaining path for a nested locale-prefixed URL', async () => {
        const req = makeRequest('https://example.com/de/blog/post-1');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-pathname')).toBe('/blog/post-1');
    });

    it('sets x-pathname to the full path when there is no locale prefix', async () => {
        const req = makeRequest('https://example.com/about');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-pathname')).toBe('/about');
    });

    it('does not treat a locale-named string as a locale prefix mid-path', async () => {
        const req = makeRequest('https://example.com/blog/de/post-1');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-pathname')).toBe('/blog/de/post-1');
    });

    it('handles a locale-prefixed path with a trailing slash', async () => {
        const req = makeRequest('https://example.com/de/blog/');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-pathname')).toBe('/blog');
    });

    it('collapses duplicate slashes in a locale-prefixed path, matching split/filter(Boolean) semantics', async () => {
        const req = makeRequest('https://example.com/de//blog//post');
        const res = await intlMiddleware(req);
        expect(res.headers.get('x-pathname')).toBe('/blog/post');
    });

    it('catches internal errors and falls back to NextResponse.next', async () => {
        const req = makeRequest('https://example.com/about');
        const handler = vi.fn().mockImplementation(() => { throw new Error('boom'); });
        const res = await intlMiddleware(req, { middlewareHandler: handler });
        expect(res.status).toBe(200);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[intlMiddleware] Error: Error: boom'));
    });
});

describe('intlMiddleware with firebaseAuth configured', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.resetModules();
    });

    it('auto-wires updateFirebaseAuthSession onto the non-redirect response', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse) => {
            response.headers.set('x-firebase-auth-applied', 'true');
            return response;
        });
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        const res = await intlMiddlewareWithAuth(req);

        expect(updateFirebaseAuthSession).toHaveBeenCalled();
        expect(res.headers.get('x-firebase-auth-applied')).toBe('true');
    });

    it('skips updateFirebaseAuthSession entirely on a locale-redirect response', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse) => response);
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/about', { headers: { 'accept-language': 'de' } });
        await intlMiddlewareWithAuth(req);

        expect(updateFirebaseAuthSession).not.toHaveBeenCalled();
    });

    it('skips updateFirebaseAuthSession when middlewareEnabled is false', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: false, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse) => response);
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        await intlMiddlewareWithAuth(req);

        expect(updateFirebaseAuthSession).not.toHaveBeenCalled();
    });

    it('passes a rebuildResponse callback that builds NextResponse.next() on the pass-through path', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        let capturedRebuild: ((request: unknown) => NextResponse) | undefined;
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse, _locale: string, rebuildResponse: (request: unknown) => NextResponse) => {
            capturedRebuild = rebuildResponse;
            return response;
        });
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        await intlMiddlewareWithAuth(req);

        expect(capturedRebuild).toBeDefined();
        const rebuilt = capturedRebuild!(req);
        expect(rebuilt).toBeInstanceOf(NextResponse);
    });

    it('passes a rebuildResponse callback that builds NextResponse.rewrite() when a rewrite is in effect', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        let capturedRebuild: ((request: unknown) => NextResponse) | undefined;
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse, _locale: string, rebuildResponse: (request: unknown) => NextResponse) => {
            capturedRebuild = rebuildResponse;
            return response;
        });
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        // Default-locale URL with no locale prefix takes the rewrite (not
        // redirect) path, so `rewriteUrl` is set when `rebuildResponse` runs.
        const req = makeRequest('https://example.com/dashboard');
        await intlMiddlewareWithAuth(req);

        expect(capturedRebuild).toBeDefined();
        const rebuilt = capturedRebuild!(req);
        expect(rebuilt).toBeInstanceOf(NextResponse);
    });

    it('forwards cf.country and cf.timezone to request and response headers', async () => {
        const req = makeRequest('https://example.com/en/about') as unknown as {
            cf: { country: string; timezone: string };
            headers: Headers;
            nextUrl: URL;
            url: string;
            cookies: { get: (name: string) => { value: string } | undefined };
        };
        req.cf = { country: 'UA', timezone: 'Europe/Kyiv' };

        const res = await intlMiddleware(req as never);
        expect(res.headers.get('x-cf-country')).toBe('UA');
        expect(res.headers.get('x-cf-timezone')).toBe('Europe/Kyiv');
    });

    it('forwards cf-ipcountry and cf-timezone headers when cf object is missing', async () => {
        const req = makeRequest('https://example.com/en/about', {
            headers: {
                'cf-ipcountry': 'DE',
                'cf-timezone': 'Europe/Berlin',
            },
        });

        const res = await intlMiddleware(req);
        expect(res.headers.get('x-cf-country')).toBe('DE');
        expect(res.headers.get('x-cf-timezone')).toBe('Europe/Berlin');
    });

    it('preserves existing x-cf-country and x-cf-timezone headers', async () => {
        const req = makeRequest('https://example.com/en/about', {
            headers: {
                'x-cf-country': 'FR',
                'x-cf-timezone': 'Europe/Paris',
            },
        });

        const res = await intlMiddleware(req);
        expect(res.headers.get('x-cf-country')).toBe('FR');
        expect(res.headers.get('x-cf-timezone')).toBe('Europe/Paris');
    });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import intlMiddleware from './middleware';

function makeRequest(url: string, init?: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
}): NextRequest {
    const request = new NextRequest(url, { headers: init?.headers });
    if (init?.cookies) {
        for (const [key, value] of Object.entries(init.cookies)) {
            request.cookies.set(key, value);
        }
    }
    return request;
}

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
        // NextResponse.rewrite sets an internal header; assert via status/type instead of internals
        expect(res.status).toBe(200);
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

    it('catches internal errors and falls back to NextResponse.next', async () => {
        const req = makeRequest('https://example.com/about');
        const handler = vi.fn().mockImplementation(() => { throw new Error('boom'); });
        const res = await intlMiddleware(req, { middlewareHandler: handler });
        expect(res.status).toBe(200);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Middleware Error'));
    });
});

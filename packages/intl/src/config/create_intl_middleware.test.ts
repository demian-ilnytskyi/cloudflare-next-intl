// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { createIntlMiddleware, type IntlMiddlewareHook } from './create_intl_middleware.js';
import { makeTestRequest as makeRequest } from '../test_utils/mock_next_server.js';
import { localeCookieName } from './cookie_key.js';
import reportError from '../error_handling/report_error.js';

vi.mock('../error_handling/report_error.js', () => ({
    default: vi.fn(),
}));

describe('createIntlMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('calls afterResponse with response carrying locale cookie', async () => {
        const hookSpy = vi.fn<IntlMiddlewareHook>(async (res) => res);
        const middleware = createIntlMiddleware({ afterResponse: hookSpy });
        const req = makeRequest('https://example.com/de/x');
        const res = await middleware(req);

        expect(hookSpy).toHaveBeenCalledOnce();
        const [passedRes, ctx] = hookSpy.mock.calls[0];
        expect(passedRes.cookies.get(localeCookieName)?.value).toBe('de');
        expect(ctx.locale).toBe('de');
        expect(res.headers.get('Content-Language')).toBe('de');
    });

    it('does not call afterResponse when redirecting', async () => {
        const hookSpy = vi.fn<IntlMiddlewareHook>(async (res) => res);
        const middleware = createIntlMiddleware({ afterResponse: hookSpy });
        // non-default locale without prefix triggers redirect
        const req = makeRequest('https://example.com/x', {
            headers: { 'accept-language': 'de' },
        });
        const res = await middleware(req);

        expect(res.status).toBe(307);
        expect(hookSpy).not.toHaveBeenCalled();
    });

    it('returns afterResponse result', async () => {
        const hook: IntlMiddlewareHook = async () => {
            const nextRes = NextResponse.next();
            nextRes.headers.set('x-hook', '1');
            return nextRes;
        };
        const middleware = createIntlMiddleware({ afterResponse: hook });
        const req = makeRequest('https://example.com/de/x');
        const res = await middleware(req);

        expect(res.headers.get('x-hook')).toBe('1');
    });

    it('ctx.next rewrites when the request was rewritten', async () => {
        let rewriteResult: NextResponse | undefined;
        const hook: IntlMiddlewareHook = async (res, ctx) => {
            rewriteResult = ctx.next(ctx.request);
            return res;
        };
        const middleware = createIntlMiddleware({ afterResponse: hook });
        // default locale root path rewritten
        const req = makeRequest('https://example.com/x');
        await middleware(req);

        expect(rewriteResult).toBeDefined();
        expect(rewriteResult?.headers.get('x-middleware-rewrite')).toContain('/en/x');
    });

    it('hook throw is reported and falls back to NextResponse.next', async () => {
        const hook: IntlMiddlewareHook = async () => {
            throw new Error('hook boom');
        };
        const middleware = createIntlMiddleware({ afterResponse: hook });
        const req = makeRequest('https://example.com/de/x');
        const res = await middleware(req);

        expect(reportError).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                classOrMethodName: 'intlMiddleware',
            }),
        );
        expect(res.status).toBe(200);
    });
});

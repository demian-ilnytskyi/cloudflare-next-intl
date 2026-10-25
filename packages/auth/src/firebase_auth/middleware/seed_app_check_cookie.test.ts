import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server.js';
import seedAppCheckCookie, { isAppCheckTokenUsable } from './seed_app_check_cookie.js';

const mintServerAppCheckToken = vi.fn();
vi.mock('../server/mint_server_app_check_token.js', () => ({
    default: (...args: unknown[]) => mintServerAppCheckToken(...args),
}));

function makeJwt(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
    return `${header}.${payload}.sig`;
}

function makeRequest(url: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}): NextRequest {
    const req = new NextRequest(url, { headers });
    for (const [k, v] of Object.entries(cookies)) {
        req.cookies.set(k, v);
    }
    return req;
}

const baseFa = {
    apiKey: 'api-key',
    projectId: 'test-project',
    appCheck: {
        appId: '1:1:web:1',
        clientEmail: 'sa@test.com',
        privateKey: 'pk',
    },
};

describe('isAppCheckTokenUsable', () => {
    it('returns true when token exp is more than 5 minutes ahead', () => {
        const now = 1_000_000;
        const exp = now + 6 * 60; // 6 minutes
        const token = makeJwt(exp);
        expect(isAppCheckTokenUsable(token, now * 1000)).toBe(true);
    });

    it('returns false when token exp is within 5 minutes', () => {
        const now = 1_000_000;
        const exp = now + 4 * 60; // 4 minutes
        const token = makeJwt(exp);
        expect(isAppCheckTokenUsable(token, now * 1000)).toBe(false);
    });

    it('returns false for undefined or malformed token', () => {
        expect(isAppCheckTokenUsable(undefined)).toBe(false);
        expect(isAppCheckTokenUsable('not-a-jwt')).toBe(false);
    });
});

describe('seedAppCheckCookie', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mints and sets the cookie when the session is valid and no App Check cookie is present', async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const exp = nowSeconds + 3600;
        const token = makeJwt(exp);
        mintServerAppCheckToken.mockResolvedValueOnce(token);

        const req = makeRequest('https://example.com/dashboard');
        const res = NextResponse.next();
        await seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2]);

        expect(mintServerAppCheckToken).toHaveBeenCalledWith('test-project', 'api-key', baseFa.appCheck);
        const cookie = res.cookies.get('__fa_app_check_token__');
        expect(cookie).toBeDefined();
        expect(cookie?.value).toBe(token);
        expect(cookie?.httpOnly).toBe(false);
        expect(cookie?.secure).toBe(true);
        expect(Math.abs(cookie!.maxAge! - 3540)).toBeLessThanOrEqual(5);
        expect(req.cookies.get('__fa_app_check_token__')?.value).toBe(token);
    });

    it('does nothing when the existing App Check cookie is usable', async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const token = makeJwt(nowSeconds + 3600);
        const req = makeRequest('https://example.com/dashboard', {}, { __fa_app_check_token__: token });
        const res = NextResponse.next();

        await seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2]);
        expect(mintServerAppCheckToken).not.toHaveBeenCalled();
        expect(res.cookies.get('__fa_app_check_token__')).toBeUndefined();
    });

    it('re-mints when the existing App Check cookie expires within 5 minutes', async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const staleToken = makeJwt(nowSeconds + 120); // 2 minutes
        const freshToken = makeJwt(nowSeconds + 3600);
        mintServerAppCheckToken.mockResolvedValueOnce(freshToken);

        const req = makeRequest('https://example.com/dashboard', {}, { __fa_app_check_token__: staleToken });
        const res = NextResponse.next();

        await seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2]);
        expect(mintServerAppCheckToken).toHaveBeenCalled();
        expect(res.cookies.get('__fa_app_check_token__')?.value).toBe(freshToken);
    });

    it('never mints on a prefetch request', async () => {
        const req = makeRequest('https://example.com/dashboard', { 'next-router-prefetch': '1' });
        const res = NextResponse.next();

        await seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2]);
        expect(mintServerAppCheckToken).not.toHaveBeenCalled();
    });

    it('leaves the response untouched when the mint throws', async () => {
        mintServerAppCheckToken.mockRejectedValueOnce(new Error('mint exploded'));
        const req = makeRequest('https://example.com/dashboard');
        const res = NextResponse.next();

        await seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2]);
        expect(res.cookies.get('__fa_app_check_token__')).toBeUndefined();
    });

    it('returns false without setting the cookie when the mint yields no token', async () => {
        mintServerAppCheckToken.mockResolvedValueOnce(null);
        const req = makeRequest('https://example.com/dashboard');
        const res = NextResponse.next();

        await expect(seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2])).resolves.toBe(false);
        expect(res.cookies.get('__fa_app_check_token__')).toBeUndefined();
    });

    it('falls back to a one hour maxAge when the minted token has no exp', async () => {
        mintServerAppCheckToken.mockResolvedValueOnce('not-a-jwt');
        const req = makeRequest('https://example.com/dashboard');
        const res = NextResponse.next();

        await seedAppCheckCookie(req, res, baseFa as unknown as Parameters<typeof seedAppCheckCookie>[2]);
        expect(res.cookies.get('__fa_app_check_token__')?.maxAge).toBe(3600);
    });
});

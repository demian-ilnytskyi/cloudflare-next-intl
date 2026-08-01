// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';
import { makeTestRequest as makeRequest } from '../../test_utils/mock_next_server';

const baseFa = {
    apiKey: 'test-api-key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path: string) => path === '/login',
};

let currentConfig: { locales: string[]; firebaseAuth?: typeof baseFa & Record<string, unknown> };

vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

function makeJwt(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('updateSession', () => {
    beforeEach(() => {
        currentConfig = { locales: ['en', 'de'], firebaseAuth: { ...baseFa } };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns baseResponse untouched when firebaseAuth is not configured', async () => {
        currentConfig = { locales: ['en', 'de'] };
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('returns baseResponse untouched when middlewareEnabled is false', async () => {
        currentConfig.firebaseAuth!.middlewareEnabled = false;
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('passes through static asset requests untouched', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/favicon.ico');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('passes through /_next requests untouched', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/_next/static/chunk.js');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('passes through whitelisted paths untouched', async () => {
        currentConfig.firebaseAuth!.whiteListPaths = ['/pricing'];
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/pricing');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('treats the bare locale root (path equals the locale prefix exactly) as "/"', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('redirects to redirectAuthPath when there is no session and the page is not an auth page', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('applies default-locale prefix rules when redirecting for the default locale', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/dashboard');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('keeps the non-default locale prefix when redirecting', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/de/dashboard');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'de');
        expect(res.headers.get('location')).toBe('https://example.com/de/login');
    });

    it('allows the request through when there is no session but the page is an auth page', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/login');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('redirects away from the auth page to homePath when a valid session exists', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const req = makeRequest('https://example.com/en/login', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/');
    });

    it('passes through with a valid session on a non-auth page', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('treats an expired session token as no session', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) - 3600);
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
    });

    it('treats a malformed session token as expired/invalid', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: 'not-a-jwt' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
    });

    it('treats a token expiring within the clock-skew margin as already expired', async () => {
        const { default: updateSession } = await import('./update_session');
        // Real expiry is 30s in the future — inside the 60s clock-skew
        // margin, so this must be refreshed/redirected now rather than
        // handed to the client one request away from dying.
        const token = makeJwt(Math.floor(Date.now() / 1000) + 30);
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
    });

    it('treats a token expiring well beyond the clock-skew margin as still valid', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 300);
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('refreshes the session using a valid refresh token when no session cookie is present', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: 'new-id-token', refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'old-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res).toBe(base);
        expect(res.cookies.get('__fa_session__')?.value).toBe('new-id-token');
        expect(res.cookies.get('__fa_refresh_token__')?.value).toBe('new-refresh-token');
    });

    it('redirects to login and clears cookies when the refresh token request fails', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'bad-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(res.status).toBe(307);
    });

    it('clears an invalid session cookie when there is no refresh token to use instead', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: 'not-a-jwt' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
    });

    it('handles the fetch call throwing during token refresh', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'old-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
    });
});

describe('updateSession refresh caching (Cloudflare Workers Cache API)', () => {
    let store: Map<string, Response>;

    function makeFakeCache() {
        store = new Map();
        return {
            match: vi.fn(async (key: string) => store.get(key)?.clone()),
            put: vi.fn(async (key: string, res: Response) => {
                store.set(key, res.clone());
            }),
        };
    }

    beforeEach(() => {
        currentConfig = { locales: ['en', 'de'], firebaseAuth: { ...baseFa } };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('falls through to the real fetch and populates the cache on a miss', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: 'fresh-id-token', refresh_token: 'same-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const fakeCache = makeFakeCache();
        vi.stubGlobal('caches', { default: fakeCache });

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'a-refresh-token' },
        });
        const res = await updateSession(req, NextResponse.next(), 'en');
        // The cache write is fire-and-forget (not awaited by updateSession,
        // so this response doesn't block on it) — flush pending microtasks
        // so the write has settled before asserting on it.
        await vi.waitFor(() => expect(fakeCache.put).toHaveBeenCalledTimes(1));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(res.cookies.get('__fa_session__')?.value).toBe('fresh-id-token');
    });

    it('skips the fetch entirely on a cache hit for the same refresh token', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: 'first-call-id-token', refresh_token: 'a-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const fakeCache = makeFakeCache();
        vi.stubGlobal('caches', { default: fakeCache });

        const { default: updateSession } = await import('./update_session');
        const makeReq = () => makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'a-refresh-token' },
        });

        await updateSession(makeReq(), NextResponse.next(), 'en');
        // Same fire-and-forget write as above — wait for it to land in the
        // fake cache before the second call, or the second call would also
        // miss and this test would pass for the wrong reason.
        await vi.waitFor(() => expect(fakeCache.put).toHaveBeenCalledTimes(1));
        const res2 = await updateSession(makeReq(), NextResponse.next(), 'en');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(res2.cookies.get('__fa_session__')?.value).toBe('first-call-id-token');
    });

    it('falls back to a real fetch (no throw) when caches.default.match rejects', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: 'fresh-id-token', refresh_token: 'a-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('caches', {
            default: {
                match: vi.fn().mockRejectedValue(new Error('cache unavailable')),
                put: vi.fn().mockRejectedValue(new Error('cache unavailable')),
            },
        });

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'a-refresh-token' },
        });
        const res = await updateSession(req, NextResponse.next(), 'en');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(res.cookies.get('__fa_session__')?.value).toBe('fresh-id-token');
    });

    it('a failed refresh is never cached, so a subsequent request retries the fetch', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false });
        vi.stubGlobal('fetch', fetchMock);
        const fakeCache = makeFakeCache();
        vi.stubGlobal('caches', { default: fakeCache });

        const { default: updateSession } = await import('./update_session');
        const makeReq = () => makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'a-refresh-token' },
        });

        await updateSession(makeReq(), NextResponse.next(), 'en');
        await updateSession(makeReq(), NextResponse.next(), 'en');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fakeCache.put).not.toHaveBeenCalled();
    });
});

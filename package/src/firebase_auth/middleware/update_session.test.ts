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

let currentConfig: { locales: string[]; defaultLocale: string; firebaseAuth?: typeof baseFa & Record<string, unknown> };

vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

function makeJwt(exp: number, claims: Record<string, unknown> = {}): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp, ...claims })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('updateSession', () => {
    beforeEach(() => {
        currentConfig = { locales: ['en', 'de'], defaultLocale: 'en', firebaseAuth: { ...baseFa } };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns baseResponse untouched when firebaseAuth is not configured', async () => {
        currentConfig = { locales: ['en', 'de'], defaultLocale: 'en' };
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

    it('preserves the query string when redirecting a guest to redirectAuthPath', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard?test=test&a=b');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.headers.get('location')).toBe('https://example.com/login?test=test&a=b');
    });

    it('preserves the query string when redirecting a signed-in user away from an auth page to homePath', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const req = makeRequest('https://example.com/en/login?test=test', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.headers.get('location')).toBe('https://example.com/?test=test');
    });

    it('preserves the query string alongside a non-default locale prefix', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/de/dashboard?test=test');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'de');
        expect(res.headers.get('location')).toBe('https://example.com/de/login?test=test');
    });

    it('drops the query string when preserveRedirectQuery is false', async () => {
        currentConfig.firebaseAuth!.preserveRedirectQuery = false;
        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard?test=test');
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('redirects an unverified signed-in user to verifyEmailPath even when they are on an auth page (unverified takes priority over the auth-page redirect)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/login', {
            cookies: { __fa_session__: token, __fa_email_verified_hint__: 'false' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
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

    it('redirects to verifyEmailPath when session email is unverified', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
    });

    it('force-refreshes ON verifyEmailPath when the hint says verified but the claim is stale, then redirects home', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: true });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: freshToken, refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'true',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/');
    });

    it('clears the session ON verifyEmailPath when the forced refresh reports the refresh token is invalid', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: { message: 'TOKEN_EXPIRED' } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'true',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/login');
        expect(res.cookies.get('__fa_session__')?.value).toBe('');
    });

    it('does not redirect to verifyEmailPath when already on it', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('redirects a verified user away from verifyEmailPath to homePath', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: true });
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/');
    });

    // Regression: middleware previously redirected home on `!== false`
    // (treating a missing claim as "verified"), while AuthUserProvider's
    // client-side effect treats a falsy `user.emailVerified` (from the live
    // SDK) as unverified. When a token's claim was merely absent — not
    // `false` — this disagreement caused an infinite client<->server
    // redirect loop directly on verifyEmailPath.
    it('does NOT redirect a user with a missing (undefined) email_verified claim away from verifyEmailPath', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('passes through when email is verified', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: true });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    // Reproduces the reported ping-pong: the session cookie's email_verified
    // claim goes stale until the ID token naturally refreshes, independent
    // of the user's actual verification state. AuthUserProvider (client)
    // mirrors the live SDK's emailVerified into the hint cookie on every
    // auth-state change, so it can disagree with the stale claim sooner
    // than the claim itself refreshes. Without a forced refresh in that
    // case, middleware would keep bouncing a live-verified user to
    // verifyEmailPath forever.
    it('force-refreshes and passes through when the hint cookie disagrees with a stale unverified claim, and the refresh confirms verified', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: true });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: freshToken, refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'true',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res).toBe(base);
        expect(res.cookies.get('__fa_session__')?.value).toBe(freshToken);
        expect(res.cookies.get('__fa_refresh_token__')?.value).toBe('new-refresh-token');
    });

    it('redirects to verifyEmailPath when the hint disagrees but a forced refresh confirms the claim is still unverified', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: freshToken, refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'true',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
    });

    it('force-refreshes when there is no hint cookie at all (no positive signal the stale claim still holds)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: freshToken, refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: staleToken, __fa_refresh_token__: 'old-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
    });

    it('trusts the claim without refreshing when the hint cookie agrees (also unverified)', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'false',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
    });

    it('redirects to verifyEmailPath when the hint disagrees but there is no refresh token cookie to refresh with', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: staleToken, __fa_email_verified_hint__: 'true' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
    });

    it('trusts the stale claim when a hint-triggered forced refresh fails transiently', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'true',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/verify-email');
    });

    it('clears the session and redirects to login when a hint-triggered forced refresh reports the refresh token is invalid', async () => {
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: { message: 'INVALID_REFRESH_TOKEN' } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: false });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: {
                __fa_session__: staleToken,
                __fa_refresh_token__: 'old-refresh-token',
                __fa_email_verified_hint__: 'true',
            },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/login');
        expect(res.cookies.get('__fa_session__')?.value ?? '').toBe('');
        expect(res.cookies.get('__fa_refresh_token__')?.value ?? '').toBe('');
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

    it('rebuilds the pass-through response via rebuildResponse so the refreshed token is visible to the current render', async () => {
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
        base.cookies.set('locale-cookie', 'en');
        base.headers.set('x-base-header', 'base-value');
        const rebuilt = NextResponse.next();
        const rebuildResponse = vi.fn(() => rebuilt);

        const res = await updateSession(req, base, 'en', rebuildResponse);

        expect(rebuildResponse).toHaveBeenCalledWith(req);
        expect(res).toBe(rebuilt);
        expect(res.cookies.get('locale-cookie')?.value).toBe('en');
        expect(res.headers.get('x-base-header')).toBe('base-value');
        expect(res.cookies.get('__fa_session__')?.value).toBe('new-id-token');
        expect(res.cookies.get('__fa_refresh_token__')?.value).toBe('new-refresh-token');
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

    // Reproduces: a signed-in user with a genuinely valid refresh token
    // briefly sees /login, then bounces back to home. Cause: a transient
    // failure talking to Google's Secure Token API (network blip, 5xx,
    // cold-start latency) was treated identically to "this refresh token is
    // invalid" — clearing the refresh-token cookie and redirecting to login,
    // even though the user's refresh token was never actually invalid. The
    // client SDK still has a live session, so onIdTokenChanged immediately
    // fires signed-in on /login and force-refreshes back home — the
    // observed flash-then-bounce.
    it('does NOT clear the refresh token or redirect to login on a transient 5xx from the refresh endpoint (regression)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'still-valid-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        // Must NOT sign the user out for a transient failure.
        expect(res.status).not.toBe(307);
        expect(res.cookies.get('__fa_refresh_token__')?.value).not.toBe('');
    });

    it('does NOT clear the refresh token or redirect to login when the refresh fetch throws (network blip) (regression)', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'still-valid-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(res.status).not.toBe(307);
        expect(res.cookies.get('__fa_refresh_token__')?.value).not.toBe('');
    });

    it('treats a 400 with an unparseable body as transient, not invalid', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => { throw new Error('invalid JSON'); },
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'still-valid-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(res.status).not.toBe(307);
        expect(res.cookies.get('__fa_refresh_token__')?.value).not.toBe('');
    });

    it('DOES clear the refresh token and redirect to login when Google explicitly rejects it as invalid (400)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: { message: 'TOKEN_EXPIRED' } }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'actually-invalid-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(res.status).toBe(307);
    });
});

describe('updateSession with custom cookie names', () => {
    beforeEach(() => {
        currentConfig = {
            locales: ['en', 'de'],
            defaultLocale: 'en',
            firebaseAuth: {
                ...baseFa,
                sessionCookieName: '__session',
                refreshTokenCookieName: '__refresh_token',
            },
        };
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('passes through with a valid session under the custom cookie name', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __session: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res).toBe(base);
    });

    it('redirects to login when the custom-named session cookie is missing, even if __fa_session__ happens to be set', async () => {
        const { default: updateSession } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const req = makeRequest('https://example.com/en/dashboard', {
            // Wrong cookie name for this config — must not be picked up.
            cookies: { __fa_session__: token },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://example.com/login');
    });

    it('refreshes an expired session using the custom-named refresh-token cookie', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: 'new-id-token', refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { default: updateSession } = await import('./update_session');
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __refresh_token: 'old-refresh-token' },
        });
        const base = NextResponse.next();
        const res = await updateSession(req, base, 'en');

        expect(fetchMock).toHaveBeenCalled();
        expect(res).toBe(base);
        expect(res.cookies.get('__session')?.value).toBe('new-id-token');
        expect(res.cookies.get('__refresh_token')?.value).toBe('new-refresh-token');
        // Must not write under the default names when custom names are configured.
        expect(res.cookies.get('__fa_session__')).toBeUndefined();
        expect(res.cookies.get('__fa_refresh_token__')).toBeUndefined();
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
        currentConfig = { locales: ['en', 'de'], defaultLocale: 'en', firebaseAuth: { ...baseFa } };
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
        const liveToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: liveToken, refresh_token: 'a-refresh-token' }),
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
        expect(res2.cookies.get('__fa_session__')?.value).toBe(liveToken);
    });

    it('re-fetches when the cached id token has itself expired', async () => {
        const staleToken = makeJwt(Math.floor(Date.now() / 1000) - 10);
        const liveToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: staleToken, refresh_token: 'a-refresh-token' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: liveToken, refresh_token: 'a-refresh-token' }) });
        vi.stubGlobal('fetch', fetchMock);
        const fakeCache = makeFakeCache();
        vi.stubGlobal('caches', { default: fakeCache });

        const { default: updateSession } = await import('./update_session');
        const makeReq = () => makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_refresh_token__: 'a-refresh-token' },
        });

        await updateSession(makeReq(), NextResponse.next(), 'en');
        await vi.waitFor(() => expect(fakeCache.put).toHaveBeenCalledTimes(1));
        const res2 = await updateSession(makeReq(), NextResponse.next(), 'en');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(res2.cookies.get('__fa_session__')?.value).toBe(liveToken);
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

    describe('emailed action-link forwarding (single Firebase action URL)', () => {

        it('with actionLinkPath set, ignores ?mode= on a different path', async () => {
            currentConfig.firebaseAuth!.actionLinkPath = '/auth/action';
            currentConfig.firebaseAuth!.whiteListPaths = ['/pricing'];
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/pricing?mode=resetPassword&oobCode=a');
            const base = NextResponse.next();
            const res = await updateSession(req, base, 'en');
            expect(res).toBe(base);
        });

        it('with actionLinkPath set, forwards ?mode= arriving on that exact path', async () => {
            currentConfig.firebaseAuth!.actionLinkPath = '/auth/action';
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/auth/action?mode=resetPassword&oobCode=a');
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/reset-password?mode=resetPassword&oobCode=a',
            );
        });

        it('forwards ?mode=resetPassword to the default reset-password path, preserving the query', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/?mode=resetPassword&oobCode=abc123');
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.status).toBe(307);
            expect(res.headers.get('location')).toBe(
                'https://example.com/reset-password?mode=resetPassword&oobCode=abc123',
            );
        });

        it('forwards ?mode=verifyEmail to verifyEmailPath', async () => {
            currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/?mode=verifyEmail&oobCode=xyz');
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/verify-email?mode=verifyEmail&oobCode=xyz',
            );
        });

        it('forwards before the guest redirect, so a signed-out user keeps their oobCode', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/dashboard?mode=resetPassword&oobCode=abc');
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toContain('/reset-password');
            expect(res.headers.get('location')).not.toContain('/login');
        });

        it('honours resetPasswordPath / recoverEmailPath overrides', async () => {
            currentConfig.firebaseAuth!.resetPasswordPath = '/new-password';
            currentConfig.firebaseAuth!.recoverEmailPath = '/recover';
            const { default: updateSession } = await import('./update_session');

            const reset = await updateSession(
                makeRequest('https://example.com/en/?mode=resetPassword&oobCode=a'), NextResponse.next(), 'en');
            expect(reset.headers.get('location')).toContain('/new-password');

            const recover = await updateSession(
                makeRequest('https://example.com/en/?mode=recoverEmail&oobCode=b'), NextResponse.next(), 'en');
            expect(recover.headers.get('location')).toContain('/recover');
        });

        it('lets actionModePaths handle a mode with no dedicated config field', async () => {
            currentConfig.firebaseAuth!.actionModePaths = { verifyAndChangeEmail: '/change-email' };
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/?mode=verifyAndChangeEmail&oobCode=c');
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toContain('/change-email');
        });

        it('does not loop when the request is already on the destination path', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/reset-password?mode=resetPassword&oobCode=a');
            const base = NextResponse.next();
            const res = await updateSession(req, base, 'en');
            expect(res.headers.get('location')).not.toContain('/reset-password?');
        });

        it('ignores an unknown mode', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/pricing?mode=somethingElse');
            currentConfig.firebaseAuth!.whiteListPaths = ['/pricing'];
            const base = NextResponse.next();
            const res = await updateSession(req, base, 'en');
            expect(res).toBe(base);
        });

        it('skips the forward entirely when actionLinkRedirectEnabled is false', async () => {
            currentConfig.firebaseAuth!.actionLinkRedirectEnabled = false;
            currentConfig.firebaseAuth!.whiteListPaths = ['/pricing'];
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/en/pricing?mode=resetPassword&oobCode=a');
            const base = NextResponse.next();
            const res = await updateSession(req, base, 'en');
            expect(res).toBe(base);
        });

        it('keeps the locale prefix for a non-default locale', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest('https://example.com/de/?mode=resetPassword&oobCode=a');
            const res = await updateSession(req, NextResponse.next(), 'de');
            expect(res.headers.get('location')).toBe(
                'https://example.com/de/reset-password?mode=resetPassword&oobCode=a',
            );
        });

        it('redirects to continueUrl path when continueUrl matches the request origin', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fcustom-reset',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/custom-reset?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fcustom-reset',
            );
        });

        it('strip locale prefix from continueUrl pathname if present for same origin', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/de/auth/action?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fde%2Fcustom-reset',
            );
            const res = await updateSession(req, NextResponse.next(), 'de');
            expect(res.headers.get('location')).toBe(
                'https://example.com/de/custom-reset?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fde%2Fcustom-reset',
            );
        });

        it('falls back to mode path when continueUrl path is exact non-default locale root /de', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/de/auth/action?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fde',
            );
            const res = await updateSession(req, NextResponse.next(), 'de');
            expect(res.headers.get('location')).toBe(
                'https://example.com/de/reset-password?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fde',
            );
        });

        it('falls back to default mode path when continueUrl is unparseable/invalid URL', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=http%3A%2F%2F%3A%3Anot-a-valid-url',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/reset-password?mode=resetPassword&oobCode=a&continueUrl=http%3A%2F%2F%3A%3Anot-a-valid-url',
            );
        });


        it('redirects directly to external continueUrl when continueUrl is from another origin', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fother-site.com%2Freset',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://other-site.com/reset?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fother-site.com%2Freset',
            );
        });

        it('handles relative continueUrl path correctly as same-origin', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=%2Fcustom-reset',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/custom-reset?mode=resetPassword&oobCode=a&continueUrl=%2Fcustom-reset',
            );
        });

        it('falls back to mode path when continueUrl path is / (home root)', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/reset-password?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com',
            );
        });


        it('redirects to external origin mode path when external continueUrl path is / (home root)', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=http%3A%2F%2Flocalhost%3A3000',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'http://localhost:3000/reset-password?mode=resetPassword&oobCode=a&continueUrl=http%3A%2F%2Flocalhost%3A3000',
            );
        });

        it('keeps locale prefix on external continueUrl root fallback for non-default locale', async () => {
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/de/auth/action?mode=resetPassword&oobCode=a&continueUrl=http%3A%2F%2Flocalhost%3A3000%2F',
            );
            const res = await updateSession(req, NextResponse.next(), 'de');
            expect(res.headers.get('location')).toBe(
                'http://localhost:3000/de/reset-password?mode=resetPassword&oobCode=a&continueUrl=http%3A%2F%2Flocalhost%3A3000%2F',
            );
        });

        it('ignores continueUrl when followSameOriginContinueUrl is set to false', async () => {
            currentConfig.firebaseAuth!.followSameOriginContinueUrl = false;
            const { default: updateSession } = await import('./update_session');
            const req = makeRequest(
                'https://example.com/auth/action?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fcustom-reset',
            );
            const res = await updateSession(req, NextResponse.next(), 'en');
            expect(res.headers.get('location')).toBe(
                'https://example.com/reset-password?mode=resetPassword&oobCode=a&continueUrl=https%3A%2F%2Fexample.com%2Fcustom-reset',
            );
        });
    });
});



describe('isIdTokenExpired', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns false for a token that has not expired yet', async () => {
        const { isIdTokenExpired } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        expect(isIdTokenExpired(token)).toBe(false);
    });

    it('returns true for a token past its exp', async () => {
        const { isIdTokenExpired } = await import('./update_session');
        const token = makeJwt(Math.floor(Date.now() / 1000) - 10);
        expect(isIdTokenExpired(token)).toBe(true);
    });
});

describe('refreshIdToken skipCache option', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('bypasses a cache hit and re-fetches when skipCache is true', async () => {
        const liveToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const cachedResponse = { json: async () => ({ idToken: 'cached-id-token', refreshToken: 'a-refresh-token' }) };
        const fakeCache = { match: vi.fn(async () => cachedResponse), put: vi.fn(async () => {}) };
        vi.stubGlobal('caches', { default: fakeCache });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: liveToken, refresh_token: 'new-refresh-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { refreshIdToken } = await import('./update_session');
        const result = await refreshIdToken('api-key', 'a-refresh-token', { skipCache: true });

        expect(fakeCache.match).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ status: 'refreshed', idToken: liveToken, refreshToken: 'new-refresh-token' });
    });
});

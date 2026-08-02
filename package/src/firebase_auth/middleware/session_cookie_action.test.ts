import { describe, it, expect, vi, beforeEach } from 'vitest';

const fa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};

let currentConfig: { firebaseAuth?: typeof fa & Record<string, unknown> };
vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

const cookieStore = { set: vi.fn(), delete: vi.fn() };
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => cookieStore),
}));

describe('setSessionCookie', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
    });

    it('sets an httpOnly session cookie under the default name', async () => {
        const { setSessionCookie } = await import('./session_cookie_action');
        await setSessionCookie('id-token');
        expect(cookieStore.set).toHaveBeenCalledWith('__fa_session__', 'id-token', expect.objectContaining({
            httpOnly: true,
        }));
    });

    it('also sets the refresh-token cookie when provided', async () => {
        const { setSessionCookie } = await import('./session_cookie_action');
        await setSessionCookie('id-token', 'refresh-token');
        expect(cookieStore.set).toHaveBeenCalledWith('__fa_refresh_token__', 'refresh-token', expect.objectContaining({
            httpOnly: true,
        }));
    });

    it('uses a custom sessionCookieName when configured', async () => {
        currentConfig = { firebaseAuth: { ...fa, sessionCookieName: '__session' } };
        const { setSessionCookie } = await import('./session_cookie_action');
        await setSessionCookie('id-token');
        expect(cookieStore.set).toHaveBeenCalledWith('__session', 'id-token', expect.anything());
    });

    it('throws if firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { setSessionCookie } = await import('./session_cookie_action');
        await expect(setSessionCookie('id-token')).rejects.toThrow(/firebaseAuth/);
    });
});

describe('clearSessionCookie', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
    });

    it('deletes both the session and refresh-token cookies', async () => {
        const { clearSessionCookie } = await import('./session_cookie_action');
        await clearSessionCookie();
        expect(cookieStore.delete).toHaveBeenCalledWith('__fa_session__');
        expect(cookieStore.delete).toHaveBeenCalledWith('__fa_refresh_token__');
    });

    it('throws if firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { clearSessionCookie } = await import('./session_cookie_action');
        await expect(clearSessionCookie()).rejects.toThrow(/firebaseAuth/);
    });
});

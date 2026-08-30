import { describe, it, expect, vi, beforeEach } from 'vitest';

const fa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path: string) => path === '/login',
};

let currentConfig: { firebaseAuth?: typeof fa & Record<string, unknown> };

vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

const cookieDelete = vi.fn();
const cookieGetAll = vi.fn(() => []);
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ delete: cookieDelete, getAll: cookieGetAll })),
}));

describe('clearSessionAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
    });

    it('deletes the default session and refresh-token cookies', async () => {
        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();
        expect(cookieDelete).toHaveBeenCalledWith('__fa_session__');
        expect(cookieDelete).toHaveBeenCalledWith('__fa_refresh_token__');
    });

    it('deletes custom-named cookies when configured', async () => {
        currentConfig.firebaseAuth!.sessionCookieName = 'my_session';
        currentConfig.firebaseAuth!.refreshTokenCookieName = 'my_refresh';
        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();
        expect(cookieDelete).toHaveBeenCalledWith('my_session');
        expect(cookieDelete).toHaveBeenCalledWith('my_refresh');
    });

    it('is a no-op when firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();
        expect(cookieDelete).not.toHaveBeenCalled();
    });
});

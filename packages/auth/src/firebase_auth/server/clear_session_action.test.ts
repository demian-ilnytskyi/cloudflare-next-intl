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

    it('deletes the default session, refresh-token, and session marker cookies', async () => {
        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();
        expect(cookieDelete).toHaveBeenCalledWith('__fa_session__');
        expect(cookieDelete).toHaveBeenCalledWith('__fa_refresh_token__');
        expect(cookieDelete).toHaveBeenCalledWith('__fa_has_session__');
    });

    it('deletes custom-named cookies when configured', async () => {
        currentConfig.firebaseAuth!.sessionCookieName = 'my_session';
        currentConfig.firebaseAuth!.refreshTokenCookieName = 'my_refresh';
        currentConfig.firebaseAuth!.sessionMarkerCookieName = 'my_marker';
        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();
        expect(cookieDelete).toHaveBeenCalledWith('my_session');
        expect(cookieDelete).toHaveBeenCalledWith('my_refresh');
        expect(cookieDelete).toHaveBeenCalledWith('my_marker');
    });

    it('is a no-op when firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();
        expect(cookieDelete).not.toHaveBeenCalled();
    });

    it('deletes the binding on clearSessionAction when deviceBinding is configured', async () => {
        const deleteMock = vi.fn();
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: vi.fn(), put: vi.fn(), delete: deleteMock },
        };
        const cookieGet = vi.fn((name: string) => name === '__fa_refresh_token__' ? { name, value: 'current-refresh-token' } : undefined);
        const { cookies } = await import('next/headers');
        vi.mocked(cookies).mockResolvedValueOnce({
            delete: cookieDelete,
            getAll: cookieGetAll,
            get: cookieGet,
        } as unknown as Awaited<ReturnType<typeof cookies>>);

        const { default: clearSessionAction } = await import('./clear_session_action.js');
        await clearSessionAction();

        expect(deleteMock).toHaveBeenCalledWith(expect.stringContaining('fa-device:'));
        expect(cookieDelete).toHaveBeenCalledWith('__fa_session__');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeSessionMarker } from '../session_marker.js';

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

const cookieSet = vi.fn();
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ set: cookieSet })),
}));

function makeJwt(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp, sub: 'user-1' })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('syncSessionAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
    });

    it('sets the HttpOnly pair and the marker', async () => {
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const refreshToken = 'valid-refresh-token';

        const result = await syncSessionAction({ idToken, refreshToken });
        expect(result).toEqual({ status: 'synced' });

        expect(cookieSet).toHaveBeenCalledWith('__fa_session__', idToken, expect.objectContaining({
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
        }));

        expect(cookieSet).toHaveBeenCalledWith('__fa_refresh_token__', refreshToken, expect.objectContaining({
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
        }));

        expect(cookieSet).toHaveBeenCalledWith('__fa_has_session__', expect.any(String), expect.objectContaining({
            httpOnly: false,
            secure: true,
            sameSite: 'lax',
            path: '/',
        }));

        const markerCall = cookieSet.mock.calls.find((call) => call[0] === '__fa_has_session__');
        const marker = decodeSessionMarker(markerCall[1]);
        expect(marker).not.toBeNull();
        expect(marker?.expiresAt).toBeGreaterThan(now);
    });

    it('rejects an expired ID token without writing cookies', async () => {
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 100);
        const result = await syncSessionAction({ idToken: expiredToken, refreshToken: 'refresh' });
        expect(result).toEqual({ status: 'rejected' });
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('rejects a missing refresh token', async () => {
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const result = await syncSessionAction({ idToken: validToken, refreshToken: '' });
        expect(result).toEqual({ status: 'rejected' });
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('rejects when firebaseAuth is not configured', async () => {
        currentConfig = {};
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        const result = await syncSessionAction({ idToken: validToken, refreshToken: 'refresh' });
        expect(result).toEqual({ status: 'rejected' });
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('stores the device key when the sync carries one', async () => {
        const putMock = vi.fn();
        const getMock = vi.fn().mockResolvedValue(null);
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: getMock, put: putMock, delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const devicePublicJwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' };

        const result = await syncSessionAction({ idToken, refreshToken: 'ref-token', devicePublicJwk });
        expect(result).toEqual({ status: 'synced' });
        expect(putMock).toHaveBeenCalledWith(expect.stringContaining('fa-device:'), JSON.stringify(devicePublicJwk));

        const markerCall = cookieSet.mock.calls.find((call) => call[0] === '__fa_has_session__');
        const marker = decodeSessionMarker(markerCall[1]);
        expect(marker?.bound).toBe(true);
    });

    it('does not touch the store when deviceBinding is unset', async () => {
        currentConfig.firebaseAuth!.deviceBinding = undefined;
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const devicePublicJwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' };

        const result = await syncSessionAction({ idToken, refreshToken: 'ref-token', devicePublicJwk });
        expect(result).toEqual({ status: 'synced' });

        const markerCall = cookieSet.mock.calls.find((call) => call[0] === '__fa_has_session__');
        const marker = decodeSessionMarker(markerCall[1]);
        expect(marker?.bound).toBe(false);
    });

    it('fails open without overwriting key when store.get fails', async () => {
        const putMock = vi.fn();
        const getMock = vi.fn().mockRejectedValue(new Error('KV unavailable'));
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: getMock, put: putMock, delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const newJwk = { kty: 'EC', crv: 'P-256', x: 'new' };

        const result = await syncSessionAction({ idToken, refreshToken: 'ref-token', devicePublicJwk: newJwk });
        expect(result).toEqual({ status: 'synced' });
        expect(putMock).not.toHaveBeenCalled();

        const markerCall = cookieSet.mock.calls.find((call) => call[0] === '__fa_has_session__');
        const marker = decodeSessionMarker(markerCall[1]);
        expect(marker?.bound).toBe(false);
    });

    it('re-binds a new key when auth_time is fresh', async () => {
        const putMock = vi.fn();
        const oldJwk = { kty: 'EC', crv: 'P-256', x: 'old' };
        const getMock = vi.fn().mockResolvedValue(JSON.stringify(oldJwk));
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: getMock, put: putMock, delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp: now + 3600, sub: 'user-1', auth_time: now - 50 })).toString('base64url');
        const idToken = `${header}.${payload}.sig`;
        const newJwk = { kty: 'EC', crv: 'P-256', x: 'new' };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id_token: idToken,
                refresh_token: 'ref-token',
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await syncSessionAction({ idToken, refreshToken: 'ref-token', devicePublicJwk: newJwk });
        expect(result).toEqual({ status: 'synced' });
        expect(putMock).toHaveBeenCalledWith(expect.stringContaining('fa-device:'), JSON.stringify(newJwk));
        vi.unstubAllGlobals();
    });

    it('refuses to re-bind a new key for an old auth_time', async () => {
        const putMock = vi.fn();
        const oldJwk = { kty: 'EC', crv: 'P-256', x: 'old' };
        const getMock = vi.fn().mockResolvedValue(JSON.stringify(oldJwk));
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: getMock, put: putMock, delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp: now + 3600, sub: 'user-1', auth_time: now - 600 })).toString('base64url');
        const idToken = `${header}.${payload}.sig`;
        const newJwk = { kty: 'EC', crv: 'P-256', x: 'new' };

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id_token: idToken,
                refresh_token: 'ref-token',
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await syncSessionAction({ idToken, refreshToken: 'ref-token', devicePublicJwk: newJwk });
        expect(result).toEqual({ status: 'rebind-refused' });
        expect(putMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('sets isBound when existing key equals new key', async () => {
        const jwk = { kty: 'EC', crv: 'P-256', x: 'same' };
        const getMock = vi.fn().mockResolvedValue(JSON.stringify(jwk));
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: getMock, put: vi.fn(), delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const result = await syncSessionAction({ idToken, refreshToken: 'ref', devicePublicJwk: jwk });
        expect(result).toEqual({ status: 'synced' });
    });

    it('catches and reports error when store.put fails on initial bind', async () => {
        const putMock = vi.fn().mockRejectedValue(new Error('store put error'));
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: vi.fn().mockResolvedValue(null), put: putMock, delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const result = await syncSessionAction({ idToken, refreshToken: 'ref', devicePublicJwk: { kty: 'EC', crv: 'P-256', x: '1' } });
        expect(result).toEqual({ status: 'synced' });
    });

    it('catches and reports error when store.put fails on rebind', async () => {
        const putMock = vi.fn().mockRejectedValue(new Error('store put rebind error'));
        const oldJwk = { kty: 'EC', crv: 'P-256', x: 'old' };
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: vi.fn().mockResolvedValue(JSON.stringify(oldJwk)), put: putMock, delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ exp: now + 3600, sub: 'user-1', auth_time: now - 50 })).toString('base64url');
        const idToken = `${header}.${payload}.sig`;
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: idToken, refresh_token: 'ref' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const result = await syncSessionAction({ idToken, refreshToken: 'ref', devicePublicJwk: { kty: 'EC', crv: 'P-256', x: 'new' } });
        expect(result).toEqual({ status: 'synced' });
        vi.unstubAllGlobals();
    });

    it('refuses rebind when refresh token call fails', async () => {
        const oldJwk = { kty: 'EC', crv: 'P-256', x: 'old' };
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: vi.fn().mockResolvedValue(JSON.stringify(oldJwk)), put: vi.fn(), delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: { message: 'INVALID_REFRESH_TOKEN' } }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const result = await syncSessionAction({ idToken, refreshToken: 'bad-ref', devicePublicJwk: { kty: 'EC', crv: 'P-256', x: 'new' } });
        expect(result).toEqual({ status: 'rebind-refused' });
        vi.unstubAllGlobals();
    });

    it('extractAuthTime handles malformed token payload', async () => {
        const oldJwk = { kty: 'EC', crv: 'P-256', x: 'old' };
        currentConfig.firebaseAuth!.deviceBinding = {
            store: { get: vi.fn().mockResolvedValue(JSON.stringify(oldJwk)), put: vi.fn(), delete: vi.fn() },
        };
        const { default: syncSessionAction } = await import('./sync_session_action.js');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id_token: 'invalid.payload!!!.sig', refresh_token: 'ref' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const now = Math.floor(Date.now() / 1000);
        const idToken = makeJwt(now + 3600);
        const result = await syncSessionAction({ idToken, refreshToken: 'ref', devicePublicJwk: { kty: 'EC', crv: 'P-256', x: 'new' } });
        expect(result).toEqual({ status: 'rebind-refused' });
        vi.unstubAllGlobals();
    });

});

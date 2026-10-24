import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeSessionMarker } from '../session_marker.js';

const fa = {
    apiKey: 'test-api-key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path: string) => path === '/login',
    appCheck: {
        clientEmail: 'sa@proj.iam.gserviceaccount.com',
        privateKey: 'dummy-private-key',
    },
};

let currentConfig: { firebaseAuth?: typeof fa & Record<string, unknown> };

vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

const mockCookies: Record<string, string> = {};
const cookieSet = vi.fn((name: string, val: string) => {
    mockCookies[name] = val;
});
const cookieDelete = vi.fn((name: string) => {
    delete mockCookies[name];
});
const cookieGet = vi.fn((name: string) => {
    const val = mockCookies[name];
    return val !== undefined ? { name, value: val } : undefined;
});

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: cookieGet,
        set: cookieSet,
        delete: cookieDelete,
    })),
}));

import type * as RefreshIdTokenModule from '../refresh_id_token.js';
import type * as UpdateSessionModule from '../middleware/update_session.js';

const refreshIdTokenMock = vi.fn();
vi.mock('../refresh_id_token.js', async (importOriginal) => {
    const actual = await importOriginal<typeof RefreshIdTokenModule>();
    return {
        ...actual,
        refreshIdToken: refreshIdTokenMock,
    };
});
vi.mock('../middleware/update_session.js', async (importOriginal) => {
    const actual = await importOriginal<typeof UpdateSessionModule>();
    return {
        ...actual,
        refreshIdToken: refreshIdTokenMock,
    };
});

const signServiceAccountJwtMock = vi.fn();
vi.mock('./sign_service_account_jwt.js', () => ({
    default: signServiceAccountJwtMock,
}));

vi.mock('cloudflare-next-intl-errors/internal/reportError', () => ({
    default: vi.fn(async () => {}),
}));

function makeJwt(exp: number, uid = 'user-123'): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp, sub: uid })).toString('base64url');
    return `${header}.${payload}.sig`;
}

describe('restoreSessionAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(mockCookies).forEach((k) => delete mockCookies[k]);
        currentConfig = { firebaseAuth: { ...fa } };
    });

    it('returns no-session when refresh token cookie is missing', async () => {
        const { default: restoreSessionAction } = await import('./restore_session_action.js');
        const res = await restoreSessionAction();
        expect(res).toEqual({ status: 'no-session' });
        expect(refreshIdTokenMock).not.toHaveBeenCalled();
    });

    it('returns invalid and clears cookies when refreshIdToken returns invalid', async () => {
        mockCookies['__fa_refresh_token__'] = 'revoked-token';
        refreshIdTokenMock.mockResolvedValue({ status: 'invalid' });

        const { default: restoreSessionAction } = await import('./restore_session_action.js');
        const res = await restoreSessionAction();

        expect(res).toEqual({ status: 'invalid' });
        expect(refreshIdTokenMock).toHaveBeenCalledWith('test-api-key', 'revoked-token', { skipCache: true });
        expect(cookieDelete).toHaveBeenCalledWith('__fa_session__');
        expect(cookieDelete).toHaveBeenCalledWith('__fa_refresh_token__');
        expect(cookieDelete).toHaveBeenCalledWith('__fa_has_session__');
    });

    it('returns unavailable without clearing cookies when refreshIdToken returns transient-failure', async () => {
        mockCookies['__fa_refresh_token__'] = 'good-token';
        refreshIdTokenMock.mockResolvedValue({ status: 'transient-failure' });

        const { default: restoreSessionAction } = await import('./restore_session_action.js');
        const res = await restoreSessionAction();

        expect(res).toEqual({ status: 'unavailable' });
        expect(cookieDelete).not.toHaveBeenCalled();
    });

    it('returns unavailable when appCheck service account credentials are missing', async () => {
        mockCookies['__fa_refresh_token__'] = 'good-token';
        const now = Math.floor(Date.now() / 1000);
        refreshIdTokenMock.mockResolvedValue({
            status: 'refreshed',
            idToken: makeJwt(now + 3600, 'uid-456'),
            refreshToken: 'new-refresh-token',
        });
        currentConfig = { firebaseAuth: { ...fa, appCheck: undefined } };

        const { default: restoreSessionAction } = await import('./restore_session_action.js');
        const res = await restoreSessionAction();

        expect(res).toEqual({ status: 'unavailable' });
    });

    it('refreshes cookies and signs custom token with correct claims when valid', async () => {
        mockCookies['__fa_refresh_token__'] = 'original-refresh-token';
        const now = Math.floor(Date.now() / 1000);
        const refreshedId = makeJwt(now + 3600, 'uid-789');
        refreshIdTokenMock.mockResolvedValue({
            status: 'refreshed',
            idToken: refreshedId,
            refreshToken: 'new-refresh-token',
        });
        signServiceAccountJwtMock.mockResolvedValue('signed-custom-jwt-token');

        const { default: restoreSessionAction } = await import('./restore_session_action.js');
        const res = await restoreSessionAction();

        expect(res).toEqual({ status: 'restored', customToken: 'signed-custom-jwt-token' });

        expect(cookieSet).toHaveBeenCalledWith('__fa_session__', refreshedId, expect.objectContaining({
            httpOnly: true,
            secure: true,
        }));
        expect(cookieSet).toHaveBeenCalledWith('__fa_refresh_token__', 'new-refresh-token', expect.objectContaining({
            httpOnly: true,
            secure: true,
        }));
        expect(cookieSet).toHaveBeenCalledWith('__fa_has_session__', expect.any(String), expect.objectContaining({
            httpOnly: false,
            secure: true,
        }));

        const markerCall = cookieSet.mock.calls.find((c) => c[0] === '__fa_has_session__');
        const marker = decodeSessionMarker(markerCall[1]);
        expect(marker?.expiresAt).toBeGreaterThan(now);

        expect(signServiceAccountJwtMock).toHaveBeenCalledWith(
            expect.objectContaining({ clientEmail: 'sa@proj.iam.gserviceaccount.com' }),
            expect.objectContaining({
                iss: 'sa@proj.iam.gserviceaccount.com',
                sub: 'sa@proj.iam.gserviceaccount.com',
                aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
                uid: 'uid-789',
                iat: expect.any(Number),
                exp: expect.any(Number),
            }),
        );
    });

    it('returns proof-required when deviceBinding is enabled and proof is missing or invalid', async () => {
        const dummyStore = {
            get: vi.fn().mockResolvedValue(JSON.stringify({ kty: 'EC', crv: 'P-256', x: '123', y: '456' })),
            put: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
        };
        currentConfig = {
            firebaseAuth: {
                ...fa,
                deviceBinding: { store: dummyStore },
            },
        };
        mockCookies['__fa_refresh_token__'] = 'bound-refresh-token';
        // No proof cookie set in mockCookies

        const { default: restoreSessionAction } = await import('./restore_session_action.js');
        const res = await restoreSessionAction();

        expect(res).toEqual({ status: 'proof-required' });
        expect(refreshIdTokenMock).not.toHaveBeenCalled();
    });
});

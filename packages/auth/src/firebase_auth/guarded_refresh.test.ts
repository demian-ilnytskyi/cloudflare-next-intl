import { describe, it, expect, vi, beforeEach } from 'vitest';

import type * as RefreshIdTokenModule from './refresh_id_token.js';
import type * as UpdateSessionModule from './middleware/update_session.js';
import type * as DeviceProofModule from './device_proof.js';

const refreshIdTokenMock = vi.fn();
vi.mock('./refresh_id_token.js', async (importOriginal) => {
    const actual = await importOriginal<typeof RefreshIdTokenModule>();
    return {
        ...actual,
        refreshIdToken: refreshIdTokenMock,
    };
});
vi.mock('./middleware/update_session.js', async (importOriginal) => {
    const actual = await importOriginal<typeof UpdateSessionModule>();
    return {
        ...actual,
        refreshIdToken: refreshIdTokenMock,
    };
});

const verifyDeviceProofMock = vi.fn();
vi.mock('./device_proof.js', async (importOriginal) => {
    const actual = await importOriginal<typeof DeviceProofModule>();
    return {
        ...actual,
        verifyDeviceProof: verifyDeviceProofMock,
    };
});

const mockCookies: Record<string, string> = {};
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => {
            const val = mockCookies[name];
            return val !== undefined ? { name, value: val } : undefined;
        },
    })),
}));

describe('guardedRefresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(mockCookies).forEach((k) => delete mockCookies[k]);
    });

    const faBase = {
        apiKey: 'test-api-key',
        authDomain: 'domain',
        projectId: 'proj',
        appId: 'app',
        redirectAuthPath: '/login',
        homePath: '/',
        isAuthPath: (p: string) => p === '/login',
    };

    it('delegates directly to refreshIdToken when deviceBinding is unset', async () => {
        const { guardedRefresh } = await import('./guarded_refresh.js');
        refreshIdTokenMock.mockResolvedValueOnce({
            status: 'refreshed',
            idToken: 'new-id',
            refreshToken: 'new-ref',
        });

        const res = await guardedRefresh(faBase, 'refresh-token-1', undefined);
        expect(res).toEqual({
            status: 'refreshed',
            idToken: 'new-id',
            refreshToken: 'new-ref',
        });
        expect(verifyDeviceProofMock).not.toHaveBeenCalled();
        expect(refreshIdTokenMock).toHaveBeenCalledWith('test-api-key', 'refresh-token-1', undefined);
    });

    it('calls refreshIdToken when proof verdict is ok', async () => {
        const { guardedRefresh } = await import('./guarded_refresh.js');
        const binding = { store: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } };
        const fa = { ...faBase, deviceBinding: binding };

        verifyDeviceProofMock.mockResolvedValueOnce('ok');
        refreshIdTokenMock.mockResolvedValueOnce({
            status: 'refreshed',
            idToken: 'new-id',
            refreshToken: 'new-ref',
        });

        const res = await guardedRefresh(fa, 'refresh-token-1', 'proof-val', { skipCache: true });
        expect(res).toEqual({
            status: 'refreshed',
            idToken: 'new-id',
            refreshToken: 'new-ref',
            bound: true,
        });
        expect(verifyDeviceProofMock).toHaveBeenCalledWith(binding, 'refresh-token-1', 'proof-val', expect.any(Number));
        expect(refreshIdTokenMock).toHaveBeenCalledWith('test-api-key', 'refresh-token-1', { skipCache: true });
    });

    it('calls refreshIdToken when proof verdict is unbound', async () => {
        const { guardedRefresh } = await import('./guarded_refresh.js');
        const binding = { store: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } };
        const fa = { ...faBase, deviceBinding: binding };

        verifyDeviceProofMock.mockResolvedValueOnce('unbound');
        refreshIdTokenMock.mockResolvedValueOnce({
            status: 'refreshed',
            idToken: 'new-id',
            refreshToken: 'new-ref',
        });

        const res = await guardedRefresh(fa, 'refresh-token-1', undefined);
        expect(res).toEqual({
            status: 'refreshed',
            idToken: 'new-id',
            refreshToken: 'new-ref',
            bound: false,
        });
        expect(refreshIdTokenMock).toHaveBeenCalled();
    });

    it('returns proof-required without calling refreshIdToken when verdict is missing', async () => {
        const { guardedRefresh } = await import('./guarded_refresh.js');
        const binding = { store: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } };
        const fa = { ...faBase, deviceBinding: binding };

        verifyDeviceProofMock.mockResolvedValueOnce('missing');

        const res = await guardedRefresh(fa, 'refresh-token-1', undefined);
        expect(res).toEqual({ status: 'proof-required' });
        expect(refreshIdTokenMock).not.toHaveBeenCalled();
    });

    it('returns proof-required without calling refreshIdToken when verdict is invalid', async () => {
        const { guardedRefresh } = await import('./guarded_refresh.js');
        const binding = { store: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } };
        const fa = { ...faBase, deviceBinding: binding };

        verifyDeviceProofMock.mockResolvedValueOnce('invalid');

        const res = await guardedRefresh(fa, 'refresh-token-1', 'bad-proof');
        expect(res).toEqual({ status: 'proof-required' });
        expect(refreshIdTokenMock).not.toHaveBeenCalled();
    });

    describe('isAuthProofPending', () => {
        it('returns true when __fa_proof_required__ cookie is 1', async () => {
            const { isAuthProofPending } = await import('./guarded_refresh.js');
            mockCookies['__fa_proof_required__'] = '1';
            expect(await isAuthProofPending()).toBe(true);
        });

        it('returns false when __fa_proof_required__ cookie is absent', async () => {
            const { isAuthProofPending } = await import('./guarded_refresh.js');
            expect(await isAuthProofPending()).toBe(false);
        });
    });
});

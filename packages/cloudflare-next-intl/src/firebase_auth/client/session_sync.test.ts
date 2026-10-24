import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeSessionMarker } from '../session_marker.js';

const syncSessionAction = vi.fn(async () => ({ status: 'synced' as const }));
vi.mock('../server/sync_session_action.js', () => ({
    default: (...args: unknown[]) => syncSessionAction(...args),
}));

const reportClientErrorMock = vi.fn(async () => {});
vi.mock('../../error_handling/report_client_error.js', () => ({
    default: (...args: unknown[]) => reportClientErrorMock(...args),
}));

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

describe('session_sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentConfig = { firebaseAuth: { ...fa } };
        document.cookie = '__fa_has_session__=; max-age=0; path=/';
    });

    describe('needsSessionSync', () => {
        it('returns true when marker is absent or undecodable', async () => {
            const { needsSessionSync } = await import('./session_sync.js');
            expect(await needsSessionSync(undefined, 'token', 1000, 100)).toBe(true);
            expect(await needsSessionSync('invalid-marker', 'token', 1000, 100)).toBe(true);
        });

        it('returns false when 21% of lifetime remains and hash matches', async () => {
            const { needsSessionSync } = await import('./session_sync.js');
            const now = 1000;
            const refreshMaxAge = 1000;
            // 21% is 210s left
            const marker = await encodeSessionMarker(now + 210, 'token');
            expect(await needsSessionSync(marker, 'token', refreshMaxAge, now)).toBe(false);
        });

        it('returns true when 19% of lifetime remains', async () => {
            const { needsSessionSync } = await import('./session_sync.js');
            const now = 1000;
            const refreshMaxAge = 1000;
            // 19% is 190s left
            const marker = await encodeSessionMarker(now + 190, 'token');
            expect(await needsSessionSync(marker, 'token', refreshMaxAge, now)).toBe(true);
        });

        it('returns true when hash does not match the refresh token', async () => {
            const { needsSessionSync } = await import('./session_sync.js');
            const now = 1000;
            const refreshMaxAge = 1000;
            const marker = await encodeSessionMarker(now + 500, 'different-token');
            expect(await needsSessionSync(marker, 'token', refreshMaxAge, now)).toBe(true);
        });

        it('re-syncs an unbound session once binding is enabled', async () => {
            const { needsSessionSync } = await import('./session_sync.js');
            const now = 1000;
            const refreshMaxAge = 1000;
            const marker = await encodeSessionMarker(now + 500, 'token', false);
            expect(await needsSessionSync(marker, 'token', refreshMaxAge, now, true)).toBe(true);
            const boundMarker = await encodeSessionMarker(now + 500, 'token', true);
            expect(await needsSessionSync(boundMarker, 'token', refreshMaxAge, now, true)).toBe(false);
        });

        it('does not re-sync forever when the device key is unsupported', async () => {
            const deviceKeyModule = await import('./device_key.js');
            vi.spyOn(deviceKeyModule, 'isDeviceKeyUnsupported').mockReturnValue(true);
            const { needsSessionSync } = await import('./session_sync.js');
            const now = 1000;
            const refreshMaxAge = 1000;
            const marker = await encodeSessionMarker(now + 500, 'token', false);
            expect(await needsSessionSync(marker, 'token', refreshMaxAge, now, true)).toBe(false);
        });
    });

    describe('ensureSessionSynced', () => {
        function makeUser(refreshToken = 'test-refresh-token', idToken = 'test-id-token') {
            return {
                refreshToken,
                getIdToken: vi.fn(async () => idToken),
            } as never;
        }

        it('makes no server call when the marker is fresh and matches', async () => {
            const { ensureSessionSynced } = await import('./session_sync.js');
            const now = Math.floor(Date.now() / 1000);
            const marker = await encodeSessionMarker(now + 60 * 60 * 24 * 365, 'test-refresh-token');
            document.cookie = `__fa_has_session__=${marker}; path=/`;

            const user = makeUser('test-refresh-token');
            await ensureSessionSynced(user);
            expect(syncSessionAction).not.toHaveBeenCalled();
        });

        it('calls syncSessionAction when marker is absent', async () => {
            const { ensureSessionSynced } = await import('./session_sync.js');
            const user = makeUser('test-refresh-token', 'my-id-token');
            await ensureSessionSynced(user);
            expect(syncSessionAction).toHaveBeenCalledWith({
                idToken: 'my-id-token',
                refreshToken: 'test-refresh-token',
            });
        });

        it('shares one in-flight sync between concurrent callers', async () => {
            const { ensureSessionSynced } = await import('./session_sync.js');
            let resolveSync: (val: { status: 'synced' }) => void;
            syncSessionAction.mockImplementationOnce(() => new Promise((resolve) => {
                resolveSync = resolve;
            }));

            const user = makeUser('concurrent-refresh-token', 'id-1');
            const p1 = ensureSessionSynced(user);
            const p2 = ensureSessionSynced(user);

            expect(p1).toBe(p2);
            await vi.waitFor(() => expect(syncSessionAction).toHaveBeenCalledTimes(1));
            resolveSync!({ status: 'synced' });
            await Promise.all([p1, p2]);
        });

        it('resolves and reports when the sync action throws', async () => {
            const { ensureSessionSynced } = await import('./session_sync.js');

            syncSessionAction.mockRejectedValueOnce(new Error('Network error'));
            const user = makeUser('error-refresh-token', 'id-err');

            await expect(ensureSessionSynced(user)).resolves.toBeUndefined();
            expect(reportClientErrorMock).toHaveBeenCalled();
        });
    });
});

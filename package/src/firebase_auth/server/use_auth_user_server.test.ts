// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebase_server', () => ({
    getAuthenticatedAppForUser: vi.fn(),
}));

describe('useAuthUser (server)', () => {
    it('returns the resolved user with loading always false', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: { uid: 'server-user' } as never,
        });
        const { default: useAuthUser } = await import('./use_auth_user_server');
        const result = await useAuthUser();
        expect(result).toEqual({ user: { uid: 'server-user' }, loading: false });
    });

    it('returns a null user when there is no authenticated session', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server');
        vi.mocked(getAuthenticatedAppForUser).mockResolvedValue({
            firebaseServerApp: null,
            currentUser: null,
        });
        const { default: useAuthUser } = await import('./use_auth_user_server');
        const result = await useAuthUser();
        expect(result).toEqual({ user: null, loading: false });
    });
});

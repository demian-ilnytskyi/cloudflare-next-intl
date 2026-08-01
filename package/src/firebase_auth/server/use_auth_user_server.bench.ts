// @vitest-environment node
import { bench, describe, vi } from 'vitest';

vi.mock('./firebase_server', () => ({
    getAuthenticatedAppForUser: vi.fn(async () => ({
        firebaseServerApp: null,
        currentUser: { uid: 'bench-user' },
    })),
}));

describe('useAuthUser (server)', () => {
    bench('resolves the authenticated user', async () => {
        const { default: useAuthUser } = await import('./use_auth_user_server');
        await useAuthUser();
    });
});

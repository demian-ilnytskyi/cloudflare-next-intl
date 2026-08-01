// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fa = {
    apiKey: 'perf-key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};

vi.mock('@intl-config', () => ({ default: { firebaseAuth: fa } }));
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: () => ({ value: 'perf-token-123456' }) })),
}));

const initializeApp = vi.fn(() => ({ name: 'perf-app' }));
const initializeServerApp = vi.fn(() => ({ name: 'perf-server-app' }));
const authStateReady = vi.fn(async () => {});
const getAuth = vi.fn(() => ({ authStateReady, currentUser: { uid: 'perf-user' } }));

vi.mock('firebase/app', () => ({
    initializeApp: (...args: unknown[]) => initializeApp(...args),
    initializeServerApp: (...args: unknown[]) => initializeServerApp(...args),
}));
vi.mock('firebase/auth', () => ({
    getAuth: (...args: unknown[]) => getAuth(...args),
}));

beforeEach(() => {
    vi.clearAllMocks();
    getAuth.mockReturnValue({ authStateReady, currentUser: { uid: 'perf-user' } });
});

afterEach(() => {
    vi.resetModules();
});

describe('getAuthenticatedAppForUser SSR cost', () => {
    it('calls initializeApp exactly once across multiple calls within the same module scope', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server');

        await getAuthenticatedAppForUser();
        await getAuthenticatedAppForUser();
        await getAuthenticatedAppForUser();

        expect(initializeApp).toHaveBeenCalledTimes(1);
    });
});

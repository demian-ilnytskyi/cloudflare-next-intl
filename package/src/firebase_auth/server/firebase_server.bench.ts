import { bench, describe, vi } from 'vitest';

const fa = {
    apiKey: 'bench-key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};

vi.mock('@intl-config', () => ({ default: { firebaseAuth: fa } }));
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: () => ({ value: 'bench-token-123456' }) })),
}));
vi.mock('@firebase/app', () => ({
    initializeApp: vi.fn(() => ({ name: 'bench-app' })),
    initializeServerApp: vi.fn(() => ({ name: 'bench-server-app' })),
}));
vi.mock('@firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: { uid: 'bench-user' }, authStateReady: vi.fn(async () => {}) })),
}));

describe('getAuthenticatedAppForUser', () => {
    bench('resolves a validated session (mocked Firebase)', async () => {
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');
        await getAuthenticatedAppForUser();
    });
});

import { bench, describe, vi } from 'vitest';

vi.mock('@intl-config', () => ({
    default: {
        firebaseAuth: {
            apiKey: 'bench-key',
            authDomain: 'domain',
            projectId: 'proj',
            appId: 'app',
            redirectAuthPath: '/login',
            homePath: '/',
            isAuthPath: () => false,
        },
    },
}));
vi.mock('@firebase/app', () => ({
    initializeApp: vi.fn(() => ({ name: 'bench-app' })),
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({ name: 'bench-app' })),
}));
vi.mock('@firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

describe('getFirebaseAuthClient', () => {
    bench('warm: cached client, no dynamic import', async () => {
        const { getFirebaseAuthClient } = await import('./firebase_client.js');
        await getFirebaseAuthClient();
    });
});

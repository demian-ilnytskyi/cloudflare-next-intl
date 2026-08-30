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

function makeToken(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    return `${header}.${payload}.sig`;
}
const perfToken = makeToken();

vi.mock('@intl-config', () => ({ default: { firebaseAuth: fa } }));
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: () => ({ value: perfToken }) })),
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
        const { getAuthenticatedAppForUser } = await import('./firebase_server.js');

        await getAuthenticatedAppForUser();
        await getAuthenticatedAppForUser();
        await getAuthenticatedAppForUser();

        expect(initializeApp).toHaveBeenCalledTimes(1);
    });
});

import { bench, describe, vi } from 'vitest';
const fa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};
vi.mock('@intl-config', () => ({ default: { firebaseAuth: fa } }));
vi.mock('./firebase_client', () => ({
    getFirebaseAuthClient: vi.fn(async () => ({ auth: {} })),
    getFirebaseAuthModule: () => import('firebase/auth'),
}));
vi.mock('../error_messages/firebase_auth_error_helper', () => ({
    default: vi.fn(() => 'translated error'),
}));
const signInWithEmailAndPassword = vi.fn(async (_auth, _email, _password) => undefined);
vi.mock('firebase/auth', () => ({
    signInWithEmailAndPassword: (auth, email, password) => signInWithEmailAndPassword(auth, email, password),
    createUserWithEmailAndPassword: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
}));
function makeFormData(fields) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields))
        fd.set(key, value);
    return fd;
}
describe('createLoginAction', () => {
    bench('creates and invokes a login action (successful sign-in)', async () => {
        const { createLoginAction } = await import('./auth_actions.js');
        const action = createLoginAction('en', {});
        await action({}, makeFormData({ email: 'a@b.com', password: 'pw' }));
    });
});

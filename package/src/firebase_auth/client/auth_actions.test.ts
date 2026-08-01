import { describe, it, expect, vi, beforeEach } from 'vitest';

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
}));
vi.mock('../error_messages/firebase_auth_error_helper', () => ({
    default: vi.fn(() => 'translated error'),
}));

const signInWithEmailAndPassword = vi.fn();
const createUserWithEmailAndPassword = vi.fn();
const sendPasswordResetEmail = vi.fn();

vi.mock('firebase/auth', () => ({
    signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (...args: unknown[]) => createUserWithEmailAndPassword(...args),
    sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args),
}));

function makeFormData(fields: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) fd.set(key, value);
    return fd;
}

describe('createLoginAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('signs in successfully and returns success state', async () => {
        signInWithEmailAndPassword.mockResolvedValue(undefined);
        const { createLoginAction } = await import('./auth_actions');
        const action = createLoginAction('en', {});
        const result = await action({}, makeFormData({ email: ' a@b.com ', password: ' pw ' }));
        expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'a@b.com', 'pw');
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error message when sign-in fails', async () => {
        signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
        const { createLoginAction } = await import('./auth_actions');
        const action = createLoginAction('en', {});
        const result = await action({}, makeFormData({ email: 'a@b.com', password: 'pw' }));
        expect(result).toEqual({ error: 'translated error' });
    });
});

describe('createSignUpAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the mismatch message without calling firebase when passwords do not match', async () => {
        const { createSignUpAction } = await import('./auth_actions');
        const action = createSignUpAction('en', { mismatch: 'Passwords do not match' });
        const result = await action(
            {},
            makeFormData({ email: 'a@b.com', password: 'pw1', confirmPassword: 'pw2' }),
        );
        expect(result).toEqual({ error: 'Passwords do not match' });
        expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('proceeds with sign-up when there is no mismatch message configured', async () => {
        createUserWithEmailAndPassword.mockResolvedValue(undefined);
        const { createSignUpAction } = await import('./auth_actions');
        const action = createSignUpAction('en', {});
        const result = await action(
            {},
            makeFormData({ email: 'a@b.com', password: 'pw1', confirmPassword: 'pw2' }),
        );
        expect(createUserWithEmailAndPassword).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('signs up successfully when passwords match', async () => {
        createUserWithEmailAndPassword.mockResolvedValue(undefined);
        const { createSignUpAction } = await import('./auth_actions');
        const action = createSignUpAction('en', { mismatch: 'no match' });
        const result = await action(
            {},
            makeFormData({ email: 'a@b.com', password: 'pw', confirmPassword: 'pw' }),
        );
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error message when sign-up fails', async () => {
        createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
        const { createSignUpAction } = await import('./auth_actions');
        const action = createSignUpAction('en', {});
        const result = await action(
            {},
            makeFormData({ email: 'a@b.com', password: 'pw', confirmPassword: 'pw' }),
        );
        expect(result).toEqual({ error: 'translated error' });
    });
});

describe('createForgotPasswordAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends a password reset email and returns success state', async () => {
        sendPasswordResetEmail.mockResolvedValue(undefined);
        const { createForgotPasswordAction } = await import('./auth_actions');
        const action = createForgotPasswordAction('en', {});
        const result = await action({}, makeFormData({ email: ' a@b.com ' }));
        expect(sendPasswordResetEmail).toHaveBeenCalledWith({}, 'a@b.com');
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error message when the reset request fails', async () => {
        sendPasswordResetEmail.mockRejectedValue({ code: 'auth/invalid-email' });
        const { createForgotPasswordAction } = await import('./auth_actions');
        const action = createForgotPasswordAction('en', {});
        const result = await action({}, makeFormData({ email: 'bad' }));
        expect(result).toEqual({ error: 'translated error' });
    });
});

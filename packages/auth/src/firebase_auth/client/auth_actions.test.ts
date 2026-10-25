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
    getFirebaseAuthModule: () => import('@firebase/auth'),
    getAppCheckToken: (...args: unknown[]) => getAppCheckToken(...args),
}));

const getAppCheckToken = vi.fn(async () => 'app-check-token');
vi.mock('../error_messages/firebase_auth_error_helper', () => ({
    default: vi.fn(() => 'translated error'),
}));

const ensureSessionSynced = vi.fn(async () => {});
vi.mock('./session_sync.js', () => ({
    ensureSessionSynced: (...args: unknown[]) => ensureSessionSynced(...args),
}));

const signInWithEmailAndPassword = vi.fn();
const createUserWithEmailAndPassword = vi.fn();
const sendPasswordResetEmail = vi.fn();
const sendSignInLinkToEmail = vi.fn();
const isSignInWithEmailLink = vi.fn();
const signInWithEmailLink = vi.fn();

vi.mock('@firebase/auth', () => ({
    signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPassword(...args),
    createUserWithEmailAndPassword: (...args: unknown[]) => createUserWithEmailAndPassword(...args),
    sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args),
    sendSignInLinkToEmail: (...args: unknown[]) => sendSignInLinkToEmail(...args),
    isSignInWithEmailLink: (...args: unknown[]) => isSignInWithEmailLink(...args),
    signInWithEmailLink: (...args: unknown[]) => signInWithEmailLink(...args),
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
        const { createLoginAction } = await import('./auth_actions.js');
        const action = createLoginAction('en', {});
        const result = await action({}, makeFormData({ email: ' a@b.com ', password: ' pw ' }));
        expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'a@b.com', 'pw');
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error message when sign-in fails', async () => {
        signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
        const { createLoginAction } = await import('./auth_actions.js');
        const action = createLoginAction('en', {});
        const result = await action({}, makeFormData({ email: 'a@b.com', password: 'pw' }));
        expect(result).toEqual({ error: 'translated error' });
    });

    it('treats missing email/password fields as empty strings', async () => {
        signInWithEmailAndPassword.mockResolvedValue(undefined);
        const { createLoginAction } = await import('./auth_actions.js');
        const action = createLoginAction('en', {});
        await action({}, new FormData());
        expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, '', '');
    });

    it('login action resolves only after the session sync', async () => {
        let resolveSync!: () => void;
        const syncPromise = new Promise<void>((res) => { resolveSync = res; });
        ensureSessionSynced.mockImplementationOnce(() => syncPromise);
        signInWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'u1' } });
        const { createLoginAction } = await import('./auth_actions.js');
        const action = createLoginAction('en', {});
        let settled = false;
        const pending = action({}, makeFormData({ email: 'a@b.com', password: 'pw' })).then((res) => {
            settled = true;
            return res;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        resolveSync();
        const result = await pending;
        expect(result).toEqual({ success: true });
        expect(ensureSessionSynced).toHaveBeenCalledWith({ uid: 'u1' });
    });
});

describe('createSignUpAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the mismatch message without calling firebase when passwords do not match', async () => {
        const { createSignUpAction } = await import('./auth_actions.js');
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
        const { createSignUpAction } = await import('./auth_actions.js');
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
        const { createSignUpAction } = await import('./auth_actions.js');
        const action = createSignUpAction('en', { mismatch: 'no match' });
        const result = await action(
            {},
            makeFormData({ email: 'a@b.com', password: 'pw', confirmPassword: 'pw' }),
        );
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error message when sign-up fails', async () => {
        createUserWithEmailAndPassword.mockRejectedValue({ code: 'auth/email-already-in-use' });
        const { createSignUpAction } = await import('./auth_actions.js');
        const action = createSignUpAction('en', {});
        const result = await action(
            {},
            makeFormData({ email: 'a@b.com', password: 'pw', confirmPassword: 'pw' }),
        );
        expect(result).toEqual({ error: 'translated error' });
    });

    it('treats a missing confirmPassword field as an empty string', async () => {
        const { createSignUpAction } = await import('./auth_actions.js');
        const action = createSignUpAction('en', { mismatch: 'no match' });
        const result = await action({}, makeFormData({ email: 'a@b.com', password: 'pw' }));
        expect(result).toEqual({ error: 'no match' });
        expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('sign-up action resolves only after the session sync', async () => {
        let resolveSync!: () => void;
        const syncPromise = new Promise<void>((res) => { resolveSync = res; });
        ensureSessionSynced.mockImplementationOnce(() => syncPromise);
        createUserWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'u-signup' } });
        const { createSignUpAction } = await import('./auth_actions.js');
        const action = createSignUpAction('en', {});
        let settled = false;
        const pending = action({}, makeFormData({ email: 'a@b.com', password: 'pw', confirmPassword: 'pw' })).then((res) => {
            settled = true;
            return res;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        resolveSync();
        const result = await pending;
        expect(result).toEqual({ success: true });
        expect(ensureSessionSynced).toHaveBeenCalledWith({ uid: 'u-signup' });
    });
});

describe('createForgotPasswordAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends a password reset email and returns success state', async () => {
        sendPasswordResetEmail.mockResolvedValue(undefined);
        const { createForgotPasswordAction } = await import('./auth_actions.js');
        const action = createForgotPasswordAction('en');
        const result = await action({}, makeFormData({ email: ' a@b.com ' }));
        expect(sendPasswordResetEmail).toHaveBeenCalledWith({}, 'a@b.com', undefined);
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error message when the reset request fails', async () => {
        sendPasswordResetEmail.mockRejectedValue({ code: 'auth/invalid-email' });
        const { createForgotPasswordAction } = await import('./auth_actions.js');
        const action = createForgotPasswordAction('en');
        const result = await action({}, makeFormData({ email: 'bad' }));
        expect(result).toEqual({ error: 'translated error' });
    });

    it('treats a missing email field as an empty string', async () => {
        sendPasswordResetEmail.mockResolvedValue(undefined);
        const { createForgotPasswordAction } = await import('./auth_actions.js');
        const action = createForgotPasswordAction('en');
        await action({}, new FormData());
        expect(sendPasswordResetEmail).toHaveBeenCalledWith({}, '', undefined);
    });

    it('passes actionCodeSettings to sendPasswordResetEmail when provided', async () => {
        sendPasswordResetEmail.mockResolvedValue(undefined);
        const { createForgotPasswordAction } = await import('./auth_actions.js');
        const settings = { url: 'https://example.com/login', handleCodeInApp: true };
        const action = createForgotPasswordAction('en', settings);
        await action({}, makeFormData({ email: 'a@b.com' }));
        expect(sendPasswordResetEmail).toHaveBeenCalledWith({}, 'a@b.com', settings);
    });
});

describe('createSendSignInLinkAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const settings = { url: 'https://example.com/complete-sign-in', handleCodeInApp: true };

    it('sends a sign-in link and returns success with the trimmed email', async () => {
        sendSignInLinkToEmail.mockResolvedValue(undefined);
        const { createSendSignInLinkAction } = await import('./auth_actions.js');
        const action = createSendSignInLinkAction('en', settings);
        const result = await action({}, makeFormData({ email: ' a@b.com ' }));
        expect(sendSignInLinkToEmail).toHaveBeenCalledWith({}, 'a@b.com', {
            ...settings,
            url: 'https://example.com/complete-sign-in?email=a%40b.com',
        });
        expect(result).toEqual({ success: true, email: 'a@b.com' });
    });

    it('returns a translated error message when sending fails', async () => {
        sendSignInLinkToEmail.mockRejectedValue({ code: 'auth/invalid-email' });
        const { createSendSignInLinkAction } = await import('./auth_actions.js');
        const action = createSendSignInLinkAction('en', settings);
        const result = await action({}, makeFormData({ email: 'bad' }));
        expect(result).toEqual({ error: 'translated error' });
    });

    it('treats a missing email field as an empty string', async () => {
        sendSignInLinkToEmail.mockResolvedValue(undefined);
        const { createSendSignInLinkAction } = await import('./auth_actions.js');
        const action = createSendSignInLinkAction('en', settings);
        await action({}, new FormData());
        expect(sendSignInLinkToEmail).toHaveBeenCalledWith({}, '', {
            ...settings,
            url: 'https://example.com/complete-sign-in?email=',
        });
    });
});

describe('completeSignInWithLink', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('signs in when the URL is a valid email sign-in link', async () => {
        isSignInWithEmailLink.mockReturnValue(true);
        signInWithEmailLink.mockResolvedValue(undefined);
        const { completeSignInWithLink } = await import('./auth_actions.js');
        const result = await completeSignInWithLink('en', 'https://x/complete?apiKey=1', 'a@b.com');
        expect(isSignInWithEmailLink).toHaveBeenCalledWith({}, 'https://x/complete?apiKey=1');
        expect(signInWithEmailLink).toHaveBeenCalledWith({}, 'a@b.com', 'https://x/complete?apiKey=1');
        expect(result).toEqual({ success: true });
    });

    it('returns a translated error without calling signInWithEmailLink when the URL is not a valid link', async () => {
        isSignInWithEmailLink.mockReturnValue(false);
        const { completeSignInWithLink } = await import('./auth_actions.js');
        const result = await completeSignInWithLink('en', 'https://x/complete', 'a@b.com');
        expect(signInWithEmailLink).not.toHaveBeenCalled();
        expect(result).toEqual({ error: 'translated error' });
    });

    it('returns a translated error when sign-in fails', async () => {
        isSignInWithEmailLink.mockReturnValue(true);
        signInWithEmailLink.mockRejectedValue({ code: 'auth/invalid-action-code' });
        const { completeSignInWithLink } = await import('./auth_actions.js');
        const result = await completeSignInWithLink('en', 'https://x/complete', 'a@b.com');
        expect(result).toEqual({ error: 'translated error' });
    });

    it('completeSignInWithLink resolves only after the session sync', async () => {
        let resolveSync!: () => void;
        const syncPromise = new Promise<void>((res) => { resolveSync = res; });
        ensureSessionSynced.mockImplementationOnce(() => syncPromise);
        isSignInWithEmailLink.mockReturnValue(true);
        signInWithEmailLink.mockResolvedValueOnce({ user: { uid: 'u-link' } });
        const { completeSignInWithLink } = await import('./auth_actions.js');
        let settled = false;
        const pending = completeSignInWithLink('en', 'https://x/complete?apiKey=1', 'a@b.com').then((res) => {
            settled = true;
            return res;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        resolveSync();
        const result = await pending;
        expect(result).toEqual({ success: true });
        expect(ensureSessionSynced).toHaveBeenCalledWith({ uid: 'u-link' });
    });
});



describe('App Check token is resolved before the Firebase call', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isSignInWithEmailLink.mockReturnValue(true);
    });

    const cases: [string, ReturnType<typeof vi.fn>, () => Promise<unknown>][] = [
        ['login', signInWithEmailAndPassword, async () => (await import('./auth_actions.js')).createLoginAction('en', {})({}, makeFormData({ email: 'a@b.com', password: 'pw' }))],
        ['sign-up', createUserWithEmailAndPassword, async () => (await import('./auth_actions.js')).createSignUpAction('en', {})({}, makeFormData({ email: 'a@b.com', password: 'pw', confirmPassword: 'pw' }))],
        ['forgot password', sendPasswordResetEmail, async () => (await import('./auth_actions.js')).createForgotPasswordAction('en')({}, makeFormData({ email: 'a@b.com' }))],
        ['send sign-in link', sendSignInLinkToEmail, async () => (await import('./auth_actions.js')).createSendSignInLinkAction('en', { url: 'https://x/complete' })({}, makeFormData({ email: 'a@b.com' }))],
        ['complete sign-in link', signInWithEmailLink, async () => (await import('./auth_actions.js')).completeSignInWithLink('en', 'https://x/complete', 'a@b.com')],
    ];

    it.each(cases)('%s waits for getAppCheckToken', async (_name, firebaseCall, run) => {
        let resolveToken!: (token: string) => void;
        getAppCheckToken.mockImplementationOnce(() => new Promise<string>((res) => { resolveToken = res; }));
        firebaseCall.mockResolvedValue(undefined);
        const pending = run();
        await new Promise((res) => setTimeout(res, 0));
        expect(getAppCheckToken).toHaveBeenCalled();
        expect(firebaseCall).not.toHaveBeenCalled();
        resolveToken('app-check-token');
        await pending;
        expect(firebaseCall).toHaveBeenCalled();
    });
});

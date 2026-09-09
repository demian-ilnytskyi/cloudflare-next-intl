import { describe, it, expect, vi, beforeEach } from 'vitest';

const notFound = vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

let currentUser: { email?: string | null } | null;
vi.mock('../../firebase_auth/server/use_auth_user_server.js', () => ({
    getAuthUser: vi.fn(async () => ({ user: currentUser, loading: false })),
}));

const cookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
        set: (name: string, value: string) => { cookieStore.set(name, value); },
    }),
}));

import { createRequireErrorsAccess, createPasswordErrorsAccess } from './gate.js';

describe('createRequireErrorsAccess', () => {
    beforeEach(() => {
        notFound.mockClear();
        currentUser = null;
    });

    it('passes when the signed-in email is in the allowed list', async () => {
        currentUser = { email: 'tester@example.com' };
        const requireAccess = createRequireErrorsAccess({ allowedEmails: ['tester@example.com'] });
        await expect(requireAccess()).resolves.toBeUndefined();
        expect(notFound).not.toHaveBeenCalled();
    });

    it('calls notFound() when there is no signed-in user', async () => {
        currentUser = null;
        const requireAccess = createRequireErrorsAccess({ allowedEmails: ['tester@example.com'] });
        await expect(requireAccess()).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('calls notFound() when the signed-in email is not in the allowed list', async () => {
        currentUser = { email: 'someone-else@example.com' };
        const requireAccess = createRequireErrorsAccess({ allowedEmails: ['tester@example.com'] });
        await expect(requireAccess()).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('accepts a predicate function instead of a fixed list', async () => {
        currentUser = { email: 'anyone@codinghouse.biz' };
        const requireAccess = createRequireErrorsAccess({
            allowedEmails: (email) => email?.endsWith('@codinghouse.biz') ?? false,
        });
        await expect(requireAccess()).resolves.toBeUndefined();
    });

    it('calls a custom onDenied instead of notFound() when provided', async () => {
        currentUser = null;
        const onDenied = vi.fn();
        const requireAccess = createRequireErrorsAccess({ allowedEmails: [], onDenied });
        await requireAccess();
        expect(onDenied).toHaveBeenCalledTimes(1);
        expect(notFound).not.toHaveBeenCalled();
    });
});

describe('createPasswordErrorsAccess', () => {
    beforeEach(() => {
        notFound.mockClear();
        cookieStore.clear();
    });

    it('hasAccess is false with no cookie set', async () => {
        const access = createPasswordErrorsAccess({ password: 'hunter2' });
        expect(await access.hasAccess()).toBe(false);
    });

    it('verifyPassword + setAuthCookie makes hasAccess true afterward', async () => {
        const access = createPasswordErrorsAccess({ password: 'hunter2' });
        expect(await access.verifyPassword('wrong')).toBe(false);
        expect(await access.verifyPassword('hunter2')).toBe(true);

        await access.setAuthCookie();
        expect(await access.hasAccess()).toBe(true);
    });

    it('requireAccess resolves once the cookie is set, and calls notFound() before that', async () => {
        const access = createPasswordErrorsAccess({ password: 'hunter2' });
        await expect(access.requireAccess()).rejects.toThrow('NEXT_NOT_FOUND');
        expect(notFound).toHaveBeenCalledTimes(1);

        notFound.mockClear();
        await access.setAuthCookie();
        await expect(access.requireAccess()).resolves.toBeUndefined();
        expect(notFound).not.toHaveBeenCalled();
    });

    it('calls a custom onDenied instead of notFound() when provided', async () => {
        const onDenied = vi.fn();
        const access = createPasswordErrorsAccess({ password: 'hunter2', onDenied });
        await access.requireAccess();
        expect(onDenied).toHaveBeenCalledTimes(1);
        expect(notFound).not.toHaveBeenCalled();
    });

    it('a cookie set under a different password no longer grants access', async () => {
        const first = createPasswordErrorsAccess({ password: 'hunter2' });
        await first.setAuthCookie();

        const second = createPasswordErrorsAccess({ password: 'different' });
        expect(await second.hasAccess()).toBe(false);
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const notFound = vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

let currentUser: { email?: string | null } | null;
vi.mock('../../firebase_auth/server/use_auth_user_server.js', () => ({
    getAuthUser: vi.fn(async () => ({ user: currentUser, loading: false })),
}));

import { createRequireErrorsAccess } from './gate.js';

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

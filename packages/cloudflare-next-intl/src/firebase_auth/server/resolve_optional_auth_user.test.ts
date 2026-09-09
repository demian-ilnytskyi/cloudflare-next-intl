// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./use_auth_user_server.js', () => ({
    getAuthUser: vi.fn(),
}));

describe('resolveOptionalAuthUser', () => {
    it('returns the resolved user when one is signed in', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        vi.mocked(getAuthUser).mockResolvedValue({ user: { uid: 'server-user' } as never, loading: false });
        const { default: resolveOptionalAuthUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveOptionalAuthUser();
        expect(result).toEqual({ user: { uid: 'server-user' } });
    });

    it('returns a null user when there is no authenticated session', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        vi.mocked(getAuthUser).mockResolvedValue({ user: null, loading: false });
        const { default: resolveOptionalAuthUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveOptionalAuthUser();
        expect(result).toEqual({ user: null });
    });

    it('swallows a getAuthUser failure (no request/session context) and returns a null user', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        vi.mocked(getAuthUser).mockRejectedValue(new Error('no request context'));
        const { default: resolveOptionalAuthUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveOptionalAuthUser();
        expect(result).toEqual({ user: null });
    });
});

describe('resolveErrorReportingUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns a null user without calling getAuthUser when useAuthUser is omitted', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        const { resolveErrorReportingUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveErrorReportingUser();
        expect(result).toEqual({ user: null });
        expect(getAuthUser).not.toHaveBeenCalled();
    });

    it('returns a null user without calling getAuthUser when useAuthUser is false', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        const { resolveErrorReportingUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveErrorReportingUser(false);
        expect(result).toEqual({ user: null });
        expect(getAuthUser).not.toHaveBeenCalled();
    });

    it('resolves the signed-in user when useAuthUser is true', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        vi.mocked(getAuthUser).mockResolvedValue({ user: { uid: 'server-user' } as never, loading: false });
        const { resolveErrorReportingUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveErrorReportingUser(true);
        expect(result).toEqual({ user: { uid: 'server-user' } });
    });

    it('swallows a getAuthUser failure when useAuthUser is true', async () => {
        const { getAuthUser } = await import('./use_auth_user_server.js');
        vi.mocked(getAuthUser).mockRejectedValue(new Error('no request context'));
        const { resolveErrorReportingUser } = await import('./resolve_optional_auth_user.js');
        const result = await resolveErrorReportingUser(true);
        expect(result).toEqual({ user: null });
    });
});

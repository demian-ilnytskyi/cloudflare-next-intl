// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

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

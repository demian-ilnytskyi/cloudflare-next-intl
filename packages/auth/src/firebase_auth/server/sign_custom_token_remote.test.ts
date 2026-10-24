// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import signCustomTokenRemote from './sign_custom_token_remote.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const OAUTH = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

describe('signCustomTokenRemote', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exchanges the refresh token then calls signJwt, returning signedJwt', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at-123' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ signedJwt: 'signed-jwt' }) });

        const result = await signCustomTokenRemote('sa@proj.iam.gserviceaccount.com', { app_id: '1' }, OAUTH);

        expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://oauth2.googleapis.com/token', expect.objectContaining({
            method: 'POST',
            body: new URLSearchParams({
                client_id: 'id',
                client_secret: 'secret',
                refresh_token: 'refresh',
                grant_type: 'refresh_token',
            }),
        }));
        expect(fetchMock).toHaveBeenNthCalledWith(2,
            'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/sa@proj.iam.gserviceaccount.com:signJwt',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer at-123' }),
                body: JSON.stringify({ payload: JSON.stringify({ app_id: '1' }) }),
            }),
        );
        expect(result).toBe('signed-jwt');
    });

    it('throws when the refresh_token exchange fails', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'invalid_grant' });
        await expect(signCustomTokenRemote('sa@proj.iam.gserviceaccount.com', { app_id: '1' }, OAUTH))
            .rejects.toThrow('oauth2 refresh_token exchange failed: 400 invalid_grant');
    });

    it('throws when signJwt fails', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at-123' }) })
            .mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'permission denied' });
        await expect(signCustomTokenRemote('sa@proj.iam.gserviceaccount.com', { app_id: '1' }, OAUTH))
            .rejects.toThrow('iamcredentials.signJwt failed: 403 permission denied');
    });
});

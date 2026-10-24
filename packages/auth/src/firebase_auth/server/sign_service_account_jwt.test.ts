// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sign = vi.fn(async () => 'signed-jwt');
const setProtectedHeader = vi.fn(() => ({ setIssuer }));
const setIssuer = vi.fn(() => ({ setSubject }));
const setSubject = vi.fn(() => ({ setAudience }));
const setAudience = vi.fn(() => ({ setIssuedAt }));
const setIssuedAt = vi.fn(() => ({ setExpirationTime }));
const setExpirationTime = vi.fn(() => ({ sign }));
const SignJWTConstructor = vi.fn(() => ({ setProtectedHeader }));
const importPKCS8 = vi.fn(async () => 'imported-key');

vi.mock('jose', () => ({
    SignJWT: class {
        constructor(...args: unknown[]) {
            return SignJWTConstructor(...args);
        }
    },
    importPKCS8: (...args: unknown[]) => importPKCS8(...args),
}));

const signCustomTokenRemote = vi.fn(async () => 'remote-jwt');
vi.mock('./sign_custom_token_remote', () => ({
    default: (...args: unknown[]) => signCustomTokenRemote(...args),
}));

describe('signServiceAccountJwt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws when clientEmail is missing', async () => {
        const { default: signServiceAccountJwt } = await import('./sign_service_account_jwt.js');
        await expect(signServiceAccountJwt({} as never, { uid: '123' })).rejects.toThrow('Missing clientEmail');
    });

    it('throws when neither privateKey nor OAuth triple is present', async () => {
        const { default: signServiceAccountJwt } = await import('./sign_service_account_jwt.js');
        await expect(signServiceAccountJwt({ clientEmail: 'sa@proj.com' }, { uid: '123' })).rejects.toThrow('Missing privateKey');
    });

    it('signs locally with jose when privateKey is present', async () => {
        const { default: signServiceAccountJwt } = await import('./sign_service_account_jwt.js');
        const token = await signServiceAccountJwt(
            { clientEmail: 'sa@proj.com', privateKey: 'some-key' },
            { iss: 'sa@proj.com', sub: 'sa@proj.com', aud: 'aud', uid: 'user-1', exp: 3600 },
        );
        expect(token).toBe('signed-jwt');
        expect(importPKCS8).toHaveBeenCalledWith('some-key', 'RS256');
        expect(SignJWTConstructor).toHaveBeenCalledWith({ uid: 'user-1' });
        expect(setProtectedHeader).toHaveBeenCalledWith({ alg: 'RS256', typ: 'JWT' });
        expect(setIssuer).toHaveBeenCalledWith('sa@proj.com');
        expect(setSubject).toHaveBeenCalledWith('sa@proj.com');
        expect(setAudience).toHaveBeenCalledWith('aud');
        expect(setExpirationTime).toHaveBeenCalledWith(3600);
        expect(sign).toHaveBeenCalledWith('imported-key');
    });

    it('signs remotely when OAuth triple is present and privateKey is absent', async () => {
        const { default: signServiceAccountJwt } = await import('./sign_service_account_jwt.js');
        const claims = { iss: 'sa@proj.com', sub: 'sa@proj.com', uid: 'user-2' };
        const token = await signServiceAccountJwt(
            {
                clientEmail: 'sa@proj.com',
                oauthClientId: 'cid',
                oauthClientSecret: 'csec',
                oauthRefreshToken: 'rtok',
            },
            claims,
        );
        expect(token).toBe('remote-jwt');
        expect(signCustomTokenRemote).toHaveBeenCalledWith('sa@proj.com', claims, {
            clientId: 'cid',
            clientSecret: 'csec',
            refreshToken: 'rtok',
        });
    });
});

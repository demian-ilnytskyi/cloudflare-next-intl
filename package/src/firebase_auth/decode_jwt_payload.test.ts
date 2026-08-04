import { describe, it, expect } from 'vitest';
import decodeJwtPayload from './decode_jwt_payload';

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${encodedPayload}.sig`;
}

describe('decodeJwtPayload', () => {
    it('decodes a well-formed JWT payload', () => {
        const token = makeJwt({ exp: 123, iat: 100, email_verified: true });
        expect(decodeJwtPayload(token)).toEqual({ exp: 123, iat: 100, email_verified: true });
    });

    it('returns null for a malformed token', () => {
        expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    });

    it('returns null for a token whose payload is not valid base64/JSON', () => {
        expect(decodeJwtPayload('header.%%%.sig')).toBeNull();
    });

    it('returns undefined fields when the payload has none of the three claims', () => {
        const token = makeJwt({ sub: 'user-1' });
        expect(decodeJwtPayload(token)).toEqual({ exp: undefined, iat: undefined, email_verified: undefined });
    });

    it('decodes a realistic Firebase ID token payload (extra unrelated claims present)', () => {
        const token = makeJwt({
            iss: 'https://securetoken.google.com/demo-project',
            aud: 'demo-project',
            auth_time: 1735689600,
            user_id: 'abc123',
            sub: 'abc123',
            iat: 1735689600,
            exp: 1735693200,
            email: 'user@example.com',
            email_verified: false,
            firebase: { identities: { email: ['user@example.com'] }, sign_in_provider: 'password' },
        });
        expect(decodeJwtPayload(token)).toEqual({ exp: 1735693200, iat: 1735689600, email_verified: false });
    });

    it('handles a negative exp/iat (values before the Unix epoch)', () => {
        const token = makeJwt({ exp: -1, iat: -100 });
        expect(decodeJwtPayload(token)).toEqual({ exp: -1, iat: -100, email_verified: undefined });
    });

    // Documents the extraction strategy's known limitation: EXP_RE/IAT_RE/
    // EMAIL_VERIFIED_RE do a first-match regex search over the raw decoded
    // JSON text rather than a structural parse, so a claim nested under a
    // same-named key elsewhere in the payload would be picked up instead of
    // (or before) the real top-level one. This is safe only because
    // Firebase ID tokens never nest `exp`/`iat`/`email_verified` under
    // another claim — this test exists so that assumption has a name and a
    // location if it's ever revisited, not to assert desired behavior.
    it('documents (does not endorse) picking up a nested same-named key when Firebase never nests these claims in practice', () => {
        const token = makeJwt({ firebase: { exp: 999 }, exp: 123 });
        expect(decodeJwtPayload(token)?.exp).toBe(999);
    });
});

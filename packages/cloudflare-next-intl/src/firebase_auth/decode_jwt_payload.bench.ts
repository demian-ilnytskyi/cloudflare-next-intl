import { bench, describe } from 'vitest';
import decodeJwtPayload from './decode_jwt_payload.js';

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${encodedPayload}.sig`;
}

// A realistic Firebase ID token payload has more claims than the ones this
// function reads — decoding cost scales with the JSON blob's size, not just
// the fields we destructure, so the bench payload mirrors that shape rather
// than a minimal `{ exp, iat }` object.
const realisticToken = makeJwt({
    iss: 'https://securetoken.google.com/demo-project',
    aud: 'demo-project',
    auth_time: 1735689600,
    user_id: 'abcDEF123456ghijKLMNOP789',
    sub: 'abcDEF123456ghijKLMNOP789',
    iat: 1735689600,
    exp: 1735693200,
    email: 'user@example.com',
    email_verified: true,
    firebase: {
        identities: { email: ['user@example.com'] },
        sign_in_provider: 'password',
    },
});

const malformedToken = 'not-a-jwt';

describe('decodeJwtPayload', () => {
    bench('valid token, realistic payload size', () => {
        decodeJwtPayload(realisticToken);
    });

    bench('malformed token (parse failure path)', () => {
        decodeJwtPayload(malformedToken);
    });
});

// Real Firebase ID tokens are RS256-signed: a ~342-character base64url
// signature segment. `split('.')` must scan/copy all of it to build the
// (unused) third array element; `split('.', 2)` does not.
const realisticSignature = 'a'.repeat(342);
const realisticJwt = `${realisticToken.split('.').slice(0, 2).join('.')}.${realisticSignature}`;

describe('decodeJwtPayload: realistic RS256-length signature', () => {
    bench('valid token, ~342-char signature segment', () => {
        decodeJwtPayload(realisticJwt);
    });
});

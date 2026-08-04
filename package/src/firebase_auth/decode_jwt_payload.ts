const EXP_RE = /"exp":(-?\d+)/;
const IAT_RE = /"iat":(-?\d+)/;
const EMAIL_VERIFIED_RE = /"email_verified":(true|false)/;

/**
 * Decodes a JWT's payload without verifying its signature — callers only
 * ever read claims from a token they already trust (their own session
 * cookie, or one just minted by the Firebase SDK/Secure Token API), never
 * one supplied by an untrusted party. Isomorphic (no `next/server` or
 * `next/client`-only APIs) so both `middleware/update_session.ts` (Edge)
 * and `client/auth_user_provider.tsx` (browser) can share one
 * implementation instead of drifting apart.
 *
 * Extracts `exp`/`iat`/`email_verified` via regex over the decoded JSON
 * text instead of a full `JSON.parse` — ~2.6x faster (benchmarked in
 * `decode_jwt_payload.bench.ts`), which matters since this runs on every
 * Edge middleware invocation. This is safe ONLY because these three claims
 * are top-level, standard JWT/Firebase registered claims that Firebase's ID
 * tokens never nest inside another object — a regex doing first-match
 * search would return a wrong value for a claim nested under a
 * same-named key. Do NOT extend this function to read additional claims
 * without confirming they're similarly guaranteed top-level, or switch back
 * to full `JSON.parse` for those calls instead.
 */
export default function decodeJwtPayload(token: string): { exp?: number; iat?: number; email_verified?: boolean } | null {
    try {
        const payload = token.split('.')[1];
        const json = atob(payload.replace(/[-_]/g, (c) => c === '-' ? '+' : '/'));
        const exp = EXP_RE.exec(json);
        const iat = IAT_RE.exec(json);
        const emailVerified = EMAIL_VERIFIED_RE.exec(json);
        return {
            exp: exp ? Number(exp[1]) : undefined,
            iat: iat ? Number(iat[1]) : undefined,
            email_verified: emailVerified ? emailVerified[1] === 'true' : undefined,
        };
    } catch {
        return null;
    }
}

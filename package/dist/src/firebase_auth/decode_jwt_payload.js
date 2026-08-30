const EXP_RE = /"exp":(-?\d+)/;
const IAT_RE = /"iat":(-?\d+)/;
const EMAIL_VERIFIED_RE = /"email_verified":(true|false)/;
export default function decodeJwtPayload(token) {
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
    }
    catch {
        return null;
    }
}

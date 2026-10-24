import decodeJwtPayload from './decode_jwt_payload.js';

export function isAppCheckTokenUsable(token: string | null | undefined, nowMs: number = Date.now()): boolean {
    if (!token) return false;
    const decoded = decodeJwtPayload(token);
    if (!decoded?.exp) return false;
    return decoded.exp * 1000 - nowMs > 5 * 60 * 1000;
}

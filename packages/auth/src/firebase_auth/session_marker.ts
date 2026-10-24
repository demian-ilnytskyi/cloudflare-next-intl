export async function refreshTokenHash(refreshToken: string): Promise<string> {
    const data = new TextEncoder().encode(refreshToken);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest).slice(0, 4);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function encodeSessionMarker(
    expiresAtSeconds: number,
    refreshToken: string,
    bound = false,
): Promise<string> {
    const hash = await refreshTokenHash(refreshToken);
    return bound ? `${expiresAtSeconds}.${hash}.b` : `${expiresAtSeconds}.${hash}`;
}

export function decodeSessionMarker(
    value: string | null | undefined,
): { expiresAt: number; hash: string; bound: boolean } | null {
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length < 2 || parts.length > 3) return null;
    const expiresAt = Number(parts[0]);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
    const hash = parts[1];
    if (!/^[0-9a-f]{8}$/.test(hash)) return null;
    if (parts.length === 3) {
        if (parts[2] !== 'b') return null;
        return { expiresAt, hash, bound: true };
    }
    return { expiresAt, hash, bound: false };
}

import { describe, expect, it } from 'vitest';
import { decodeSessionMarker, encodeSessionMarker, refreshTokenHash } from './session_marker.js';

describe('session_marker', () => {
    it('produces an 8-char lowercase hex hash that differs for different tokens', async () => {
        const hash1 = await refreshTokenHash('refresh-token-1');
        const hash2 = await refreshTokenHash('refresh-token-2');

        expect(hash1).toMatch(/^[0-9a-f]{8}$/);
        expect(hash2).toMatch(/^[0-9a-f]{8}$/);
        expect(hash1).not.toBe(hash2);
    });

    it('encodes and decodes a session marker round-trip', async () => {
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        const encoded = await encodeSessionMarker(expiresAt, 'my-refresh-token');
        const decoded = decodeSessionMarker(encoded);

        expect(decoded).not.toBeNull();
        expect(decoded?.expiresAt).toBe(expiresAt);
        expect(decoded?.hash).toBe(await refreshTokenHash('my-refresh-token'));
    });

    it('returns null for invalid marker values', () => {
        expect(decodeSessionMarker(undefined)).toBeNull();
        expect(decodeSessionMarker('')).toBeNull();
        expect(decodeSessionMarker('x')).toBeNull();
        expect(decodeSessionMarker('notanumber.abcd1234')).toBeNull();
        expect(decodeSessionMarker('1234567890')).toBeNull();
        expect(decodeSessionMarker('1234567890.short')).toBeNull();
        expect(decodeSessionMarker('1234567890.TOOLONGHEX123')).toBeNull();
        expect(decodeSessionMarker('1234567890.abcd1234.invalid')).toBeNull();
    });
});

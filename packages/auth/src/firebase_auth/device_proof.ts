import config from '@intl-config';
import reportError from 'cloudflare-next-intl-errors/internal/reportError';
import type { DeviceBindingConfig } from '../types.js';
import type { DeviceKey } from './client/device_key.js';

export const defaultDeviceProofCookieName = '__fa_device_proof__';
export const DEFAULT_PROOF_MAX_AGE_SECONDS = 3600;

export async function sha256Hex(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
}

/**
 * Creates a signed device proof cookie value for a given refresh token or marker hash: `${ts}.${signature}`.
 * Signs `${ts}.${hash8}` where hash8 is the 8-character hex prefix of sha256(refreshToken)
 * (accessible to client via session marker __fa_has_session__ even when currentUser is null).
 */
export async function createDeviceProof(
    key: DeviceKey,
    refreshTokenOrHash: string,
    nowSeconds: number,
): Promise<string> {
    const isShortHash = refreshTokenOrHash.length === 8 && /^[0-9a-fA-F]{8}$/.test(refreshTokenOrHash);
    const hash8 = isShortHash ? refreshTokenOrHash : (await sha256Hex(refreshTokenOrHash)).slice(0, 8);
    const message = `${nowSeconds}.${hash8}`;
    const signature = await key.sign(message);
    return `${nowSeconds}.${signature}`;
}

export type DeviceProofVerdict = 'ok' | 'unbound' | 'missing' | 'invalid';

/**
 * Verifies a device proof against the registered public key in the device binding store.
 *
 * Verdicts:
 * - 'unbound': the session is not bound in the store (or store get failed; fails open)
 * - 'missing': proof is undefined or empty
 * - 'invalid': malformed, outside valid time window, or signature failed
 * - 'ok': signature verified and within time window
 */
export async function verifyDeviceProof(
    binding: DeviceBindingConfig,
    refreshToken: string,
    proof: string | undefined,
    nowSeconds: number,
): Promise<DeviceProofVerdict> {
    const tokenHash = await sha256Hex(refreshToken);
    const storeKey = `fa-device:${tokenHash}`;

    let publicJwkJson: string | null = null;
    try {
        publicJwkJson = await binding.store.get(storeKey);
    } catch (error) {
        await reportError(config, {
            error,
            classOrMethodName: 'verifyDeviceProof',
        });
        return 'unbound';
    }

    if (!publicJwkJson) {
        return 'unbound';
    }

    if (!proof) {
        return 'missing';
    }

    const parts = proof.split('.');
    if (parts.length !== 2) {
        return 'invalid';
    }

    const ts = Number(parts[0]);
    if (!Number.isFinite(ts)) {
        return 'invalid';
    }

    const proofMaxAgeSeconds = binding.proofMaxAgeSeconds ?? DEFAULT_PROOF_MAX_AGE_SECONDS;
    // Window: now - 60 <= ts + maxAge AND ts <= now + 60
    if (nowSeconds - 60 > ts + proofMaxAgeSeconds || ts > nowSeconds + 60) {
        return 'invalid';
    }

    try {
        const jwk = JSON.parse(publicJwkJson) as JsonWebKey;
        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
        );

        const sigBuf = base64UrlToUint8Array(parts[1]);
        const hash8 = tokenHash.slice(0, 8);
        const message8 = `${ts}.${hash8}`;
        const messageBuf8 = new TextEncoder().encode(message8);

        let valid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            cryptoKey,
            sigBuf as unknown as BufferSource,
            messageBuf8,
        );

        if (!valid) {
            const messageFull = `${ts}.${tokenHash}`;
            const messageBufFull = new TextEncoder().encode(messageFull);
            valid = await crypto.subtle.verify(
                { name: 'ECDSA', hash: 'SHA-256' },
                cryptoKey,
                sigBuf as unknown as BufferSource,
                messageBufFull,
            );
        }

        return valid ? 'ok' : 'invalid';
    } catch {
        return 'invalid';
    }
}

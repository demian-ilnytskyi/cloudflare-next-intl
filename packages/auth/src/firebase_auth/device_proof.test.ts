import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeviceBindingConfig, DeviceBindingStore } from '../types.js';
import type { DeviceKey } from './client/device_key.js';

const reportError = vi.fn(async () => {});
vi.mock('cloudflare-next-intl-intl/internal/reportError', () => ({
    default: (...args: unknown[]) => reportError(...args),
}));

describe('deviceProof', () => {
    let mockStoreData: Record<string, string>;
    let store: DeviceBindingStore;
    let binding: DeviceBindingConfig;
    let keyPair: CryptoKeyPair;
    let publicJwk: JsonWebKey;
    let mockDeviceKey: DeviceKey;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockStoreData = {};
        store = {
            get: vi.fn(async (key: string) => mockStoreData[key] ?? null),
            put: vi.fn(async (key: string, val: string) => { mockStoreData[key] = val; }),
            delete: vi.fn(async (key: string) => { delete mockStoreData[key]; }),
        };
        binding = { store, proofMaxAgeSeconds: 3600 };

        keyPair = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify'],
        );
        publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

        mockDeviceKey = {
            publicJwk,
            async sign(message: string): Promise<string> {
                const data = new TextEncoder().encode(message);
                const sig = await crypto.subtle.sign(
                    { name: 'ECDSA', hash: 'SHA-256' },
                    keyPair.privateKey,
                    data,
                );
                return Buffer.from(sig).toString('base64url');
            },
        };
    });

    it('returns ok for a valid proof within the window', async () => {
        const { createDeviceProof, verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const proof = await createDeviceProof(mockDeviceKey, refreshToken, now);

        const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
        mockStoreData[storeKey] = JSON.stringify(publicJwk);

        const verdict = await verifyDeviceProof(binding, refreshToken, proof, now + 100);
        expect(verdict).toBe('ok');
    });

    it('returns unbound when store has no entry', async () => {
        const { createDeviceProof, verifyDeviceProof } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const proof = await createDeviceProof(mockDeviceKey, refreshToken, now);

        const verdict = await verifyDeviceProof(binding, refreshToken, proof, now);
        expect(verdict).toBe('unbound');
    });

    it('returns missing when proof is undefined or empty', async () => {
        const { verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
        mockStoreData[storeKey] = JSON.stringify(publicJwk);

        expect(await verifyDeviceProof(binding, refreshToken, undefined, now)).toBe('missing');
        expect(await verifyDeviceProof(binding, refreshToken, '', now)).toBe('missing');
    });

    it('returns invalid on malformed proof format', async () => {
        const { verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
        mockStoreData[storeKey] = JSON.stringify(publicJwk);

        expect(await verifyDeviceProof(binding, refreshToken, 'not-a-dot-separated-proof', now)).toBe('invalid');
        expect(await verifyDeviceProof(binding, refreshToken, 'abc.def.ghi', now)).toBe('invalid');
        expect(await verifyDeviceProof(binding, refreshToken, 'notanumber.sig', now)).toBe('invalid');
    });

    it('returns invalid when signature fails verification', async () => {
        const { verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
        mockStoreData[storeKey] = JSON.stringify(publicJwk);

        const badSig = Buffer.from('bad-sig-bytes-length-sufficient').toString('base64url');
        const verdict = await verifyDeviceProof(binding, refreshToken, `${now}.${badSig}`, now);
        expect(verdict).toBe('invalid');
    });

    it('checks window edges: exactly ts + proofMaxAgeSeconds + 60 is ok, + 61 is invalid', async () => {
        const { createDeviceProof, verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const ts = 1000000;
        const proof = await createDeviceProof(mockDeviceKey, refreshToken, ts);

        const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
        mockStoreData[storeKey] = JSON.stringify(publicJwk);

        const maxAge = binding.proofMaxAgeSeconds!; // 3600
        // Window edge: nowSeconds - 60 <= ts + maxAge => nowSeconds <= ts + maxAge + 60
        expect(await verifyDeviceProof(binding, refreshToken, proof, ts + maxAge + 60)).toBe('ok');
        expect(await verifyDeviceProof(binding, refreshToken, proof, ts + maxAge + 61)).toBe('invalid');
    });

    it('checks future clock skew: ts = now + 60 is ok, ts = now + 61 is invalid', async () => {
        const { createDeviceProof, verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
        mockStoreData[storeKey] = JSON.stringify(publicJwk);

        const proof60 = await createDeviceProof(mockDeviceKey, refreshToken, now + 60);
        expect(await verifyDeviceProof(binding, refreshToken, proof60, now)).toBe('ok');

        const proof61 = await createDeviceProof(mockDeviceKey, refreshToken, now + 61);
        expect(await verifyDeviceProof(binding, refreshToken, proof61, now)).toBe('invalid');
    });

    it('proof for refresh token A is rejected for refresh token B', async () => {
        const { createDeviceProof, verifyDeviceProof, sha256Hex } = await import('./device_proof.js');
        const tokenA = 'token-a';
        const tokenB = 'token-b';
        const now = 1000000;
        const proofA = await createDeviceProof(mockDeviceKey, tokenA, now);

        // Store public key under tokenB
        const storeKeyB = `fa-device:${await sha256Hex(tokenB)}`;
        mockStoreData[storeKeyB] = JSON.stringify(publicJwk);

        const verdict = await verifyDeviceProof(binding, tokenB, proofA, now);
        expect(verdict).toBe('invalid');
    });

    it('store get throwing results in unbound verdict and calls reportError', async () => {
        const { createDeviceProof, verifyDeviceProof } = await import('./device_proof.js');
        const refreshToken = 'token-123';
        const now = 1000000;
        const proof = await createDeviceProof(mockDeviceKey, refreshToken, now);

        const throwingStore: DeviceBindingStore = {
            get: vi.fn(async () => { throw new Error('KV error'); }),
            put: vi.fn(async () => {}),
            delete: vi.fn(async () => {}),
        };
        const failingBinding: DeviceBindingConfig = { store: throwingStore };

        const verdict = await verifyDeviceProof(failingBinding, refreshToken, proof, now);
        expect(verdict).toBe('unbound');
        expect(reportError).toHaveBeenCalledTimes(1);
    });
});

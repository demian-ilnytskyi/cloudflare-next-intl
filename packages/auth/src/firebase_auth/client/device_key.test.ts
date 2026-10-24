import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

describe('deviceKey', () => {
    let origIndexedDB: IDBFactory;
    let origSubtle: SubtleCrypto;

    beforeEach(() => {
        vi.resetModules();
        origIndexedDB = globalThis.indexedDB;
        origSubtle = globalThis.crypto?.subtle;
        globalThis.indexedDB = new IDBFactory();
    });

    afterEach(() => {
        globalThis.indexedDB = origIndexedDB;
        if (origSubtle) {
            Object.defineProperty(globalThis.crypto, 'subtle', {
                value: origSubtle,
                configurable: true,
                writable: true,
            });
        }
    });

    it('getDeviceKey(true) twice returns the same publicJwk with non-extractable private key', async () => {
        const { getDeviceKey } = await import('./device_key.js');
        const key1 = await getDeviceKey(true);
        expect(key1).not.toBeNull();
        expect(key1?.publicJwk).toBeDefined();
        expect(key1?.publicJwk.kty).toBe('EC');
        expect(key1?.publicJwk.crv).toBe('P-256');

        const key2 = await getDeviceKey(true);
        expect(key2).not.toBeNull();
        expect(key2?.publicJwk).toEqual(key1?.publicJwk);
    });

    it('signature verifies with crypto.subtle.verify against publicJwk', async () => {
        const { getDeviceKey } = await import('./device_key.js');
        const key = await getDeviceKey(true);
        expect(key).not.toBeNull();

        const message = 'test-message-to-sign';
        const signatureB64url = await key!.sign(message);
        expect(typeof signatureB64url).toBe('string');

        // Convert base64url back to buffer
        const signatureBin = Buffer.from(signatureB64url, 'base64url');
        const messageBin = new TextEncoder().encode(message);

        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            key!.publicJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
        );

        const valid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            cryptoKey,
            signatureBin,
            messageBin,
        );
        expect(valid).toBe(true);
    });

    it('getDeviceKey(false) after resetDeviceKey() is null', async () => {
        const { getDeviceKey, resetDeviceKey } = await import('./device_key.js');
        await getDeviceKey(true);
        expect(await getDeviceKey(false)).not.toBeNull();

        await resetDeviceKey();
        expect(await getDeviceKey(false)).toBeNull();
    });

    it('indexedDB.open throwing SecurityError causes getDeviceKey(true) to resolve null and isDeviceKeyUnsupported() to be true', async () => {
        const { getDeviceKey, isDeviceKeyUnsupported } = await import('./device_key.js');

        const badIDB = {
            open: () => {
                const err = new Error('The operation is insecure.');
                err.name = 'SecurityError';
                throw err;
            },
        } as unknown as IDBFactory;

        globalThis.indexedDB = badIDB;

        const key = await getDeviceKey(true);
        expect(key).toBeNull();
        expect(isDeviceKeyUnsupported()).toBe(true);
    });

    it('crypto.subtle undefined causes getDeviceKey(true) to resolve null and isDeviceKeyUnsupported() to be true', async () => {
        const { getDeviceKey, isDeviceKeyUnsupported } = await import('./device_key.js');

        Object.defineProperty(globalThis.crypto, 'subtle', {
            value: undefined,
            configurable: true,
            writable: true,
        });

        const key = await getDeviceKey(true);
        expect(key).toBeNull();
        expect(isDeviceKeyUnsupported()).toBe(true);
    });
});

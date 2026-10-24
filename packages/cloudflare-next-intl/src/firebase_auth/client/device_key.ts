export interface DeviceKey {
    publicJwk: JsonWebKey;
    sign(message: string): Promise<string>;
}

let deviceKeyUnsupported = false;
let cachedDeviceKey: DeviceKey | null = null;
let inFlightCreatePromise: Promise<DeviceKey | null> | null = null;

export function isDeviceKeyUnsupported(): boolean {
    return deviceKeyUnsupported;
}

const DB_NAME = 'fa-device-key';
const STORE_NAME = 'keys';
const KEY_ID = 'current';

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            return reject(new Error('IndexedDB not available'));
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
}

async function internalGetDeviceKey(create: boolean): Promise<DeviceKey | null> {
    if (cachedDeviceKey) return cachedDeviceKey;

    if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
        deviceKeyUnsupported = true;
        return null;
    }

    let db: IDBDatabase | undefined;
    try {
        db = await openDb();
        const stored = await new Promise<{
            privateKey: CryptoKey;
            publicKey: CryptoKey;
            publicJwk: JsonWebKey;
        } | undefined>((resolve, reject) => {
            const tx = db!.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(KEY_ID);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        if (stored) {
            cachedDeviceKey = {
                publicJwk: stored.publicJwk,
                async sign(message: string): Promise<string> {
                    const data = new TextEncoder().encode(message);
                    const sig = await crypto.subtle.sign(
                        { name: 'ECDSA', hash: 'SHA-256' },
                        stored.privateKey,
                        data,
                    );
                    return arrayBufferToBase64Url(sig);
                },
            };
            return cachedDeviceKey;
        }

        if (!create) {
            return null;
        }

        const keyPair = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign', 'verify'],
        );

        const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

        const record = {
            id: KEY_ID,
            privateKey: keyPair.privateKey,
            publicKey: keyPair.publicKey,
            publicJwk,
        };

        await new Promise<void>((resolve, reject) => {
            const tx = db!.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        cachedDeviceKey = {
            publicJwk,
            async sign(message: string): Promise<string> {
                const data = new TextEncoder().encode(message);
                const sig = await crypto.subtle.sign(
                    { name: 'ECDSA', hash: 'SHA-256' },
                    keyPair.privateKey,
                    data,
                );
                return arrayBufferToBase64Url(sig);
            },
        };

        return cachedDeviceKey;
    } catch {
        deviceKeyUnsupported = true;
        return null;
    } finally {
        db?.close();
    }
}

/**
 * Retrieves the device key pair from IndexedDB. If `create` is true and no key exists,
 * a non-extractable ECDSA P-256 key pair is generated and saved.
 *
 * Catches all errors from IndexedDB and crypto.subtle, sets isDeviceKeyUnsupported() to true,
 * and resolves null (never rejects).
 * Concurrent calls with create=true are memoized to return the same generated key.
 */
export async function getDeviceKey(create: boolean): Promise<DeviceKey | null> {
    if (cachedDeviceKey) return cachedDeviceKey;
    if (create && inFlightCreatePromise) return inFlightCreatePromise;

    const promise = internalGetDeviceKey(create);
    if (create) {
        inFlightCreatePromise = promise;
    }

    try {
        return await promise;
    } finally {
        if (create && inFlightCreatePromise === promise) {
            inFlightCreatePromise = null;
        }
    }
}

/**
 * Clears the stored device key from IndexedDB and in-memory cache.
 * Never rejects.
 */
export async function resetDeviceKey(): Promise<void> {
    cachedDeviceKey = null;
    inFlightCreatePromise = null;
    let db: IDBDatabase | undefined;
    try {
        if (typeof indexedDB === 'undefined') return;
        db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db!.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).delete(KEY_ID);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        // never rejects
    } finally {
        db?.close();
    }
}

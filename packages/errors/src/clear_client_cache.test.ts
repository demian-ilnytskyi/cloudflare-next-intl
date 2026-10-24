import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import clearClientCache from './clear_client_cache.js';

describe('clearClientCache', () => {
    const originalSessionStorage = window.sessionStorage;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        Object.defineProperty(window, 'sessionStorage', {
            value: originalSessionStorage,
            writable: true,
        });
    });

    it('clears caches, service workers, and sessionStorage when present', async () => {
        const deleteMock = vi.fn().mockResolvedValue(true);
        const keysMock = vi.fn().mockResolvedValue(['cache-v1', 'cache-v2']);
        const unregisterMock = vi.fn().mockResolvedValue(true);
        const getRegistrationsMock = vi.fn().mockResolvedValue([{ unregister: unregisterMock }]);
        const clearMock = vi.fn();

        Object.defineProperty(window, 'caches', {
            value: {
                keys: keysMock,
                delete: deleteMock,
            },
            configurable: true,
        });
        Object.defineProperty(navigator, 'serviceWorker', {
            value: { getRegistrations: getRegistrationsMock },
            configurable: true,
        });
        Object.defineProperty(window, 'sessionStorage', {
            value: { clear: clearMock },
            configurable: true,
        });

        await clearClientCache();

        expect(keysMock).toHaveBeenCalled();
        expect(deleteMock).toHaveBeenCalledWith('cache-v1');
        expect(deleteMock).toHaveBeenCalledWith('cache-v2');
        expect(getRegistrationsMock).toHaveBeenCalled();
        expect(unregisterMock).toHaveBeenCalled();
        expect(clearMock).toHaveBeenCalled();
    });

    it('handles absence of caches and serviceWorker gracefully', async () => {
        const clearMock = vi.fn();
        Object.defineProperty(window, 'caches', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(navigator, 'serviceWorker', {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(window, 'sessionStorage', {
            value: { clear: clearMock },
            configurable: true,
        });

        await clearClientCache();

        expect(clearMock).toHaveBeenCalled();
    });

    it('catches and suppresses any thrown errors', async () => {
        Object.defineProperty(window, 'sessionStorage', {
            get() {
                throw new Error('Access denied');
            },
            configurable: true,
        });

        await expect(clearClientCache()).resolves.toBeUndefined();
    });
});

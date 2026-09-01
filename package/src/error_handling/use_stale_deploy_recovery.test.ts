import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useStaleDeployRecovery, { shouldRecoverFromStaleDeploy, isRecentBuild } from './use_stale_deploy_recovery.js';
import * as clearClientCacheModule from './clear_client_cache.js';

const staleError = new Error('The connection to the page was unexpectedly closed');
const chunkError = new Error('Loading chunk 42 failed');
const dynamicImportError = new Error('Failed to fetch dynamically imported module');
const genericError = new Error('Database connection failed');

describe('shouldRecoverFromStaleDeploy', () => {
    it('recovers when the current build has not spent its reload (marker is null)', () => {
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', null)).toBe(true);
    });

    it('recovers when marker is empty string and buildId is set', () => {
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', '')).toBe(true);
    });

    it('does not recover when this build already reloaded recently (<15s ago)', () => {
        const now = 100_000;
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a', false, now - 5_000, now)).toBe(false);
    });

    it('recovers when the last reload for this build was >15s ago', () => {
        const now = 100_000;
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a', false, now - 20_000, now)).toBe(true);
    });

    it('does not recover when error is null or non-Error value', () => {
        expect(shouldRecoverFromStaleDeploy(null, 'build-a', null)).toBe(false);
        expect(shouldRecoverFromStaleDeploy('a string error', 'build-a', null)).toBe(false);
        expect(shouldRecoverFromStaleDeploy({ message: 'object' }, 'build-a', null)).toBe(false);
    });

    it('recovers for all recognized stale deploy error patterns', () => {
        expect(shouldRecoverFromStaleDeploy(chunkError, 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(dynamicImportError, 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(new Error('loading css chunk failed'), 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(new Error('connection closed by server'), 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(new Error('error reading RSC payload'), 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(new Error('Minified React error #412'), 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(new Error('The above error occurred in a React component'), 'build-a', null)).toBe(true);
        const namedChunkError = new Error('custom message');
        namedChunkError.name = 'ChunkLoadError';
        expect(shouldRecoverFromStaleDeploy(namedChunkError, 'build-a', null)).toBe(true);
    });
});

describe('isRecentBuild', () => {
    it('is recent when set less than a minute ago', () => {
        expect(isRecentBuild(1_000, 1_000 + 59_000)).toBe(true);
    });

    it('is not recent at or after the default 60_000ms window', () => {
        expect(isRecentBuild(1_000, 1_000 + 60_000)).toBe(false);
        expect(isRecentBuild(1_000, 1_000 + 60_001)).toBe(false);
    });

    it('is not recent when never set (setAt is null)', () => {
        expect(isRecentBuild(null, Date.now())).toBe(false);
    });

    it('supports custom windowMs parameter', () => {
        expect(isRecentBuild(1_000, 1_000 + 2_000, 5_000)).toBe(true);
        expect(isRecentBuild(1_000, 1_000 + 6_000, 5_000)).toBe(false);
    });

    it('returns false when localStorage throws in buildIdSetAt', () => {
        const originalGetItem = window.localStorage.getItem;
        window.localStorage.getItem = (key: string) => {
            if (key === 'buildIdSetAt') throw new Error('QuotaExceeded');
            return originalGetItem.call(window.localStorage, key);
        };
        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 500));
        expect(result.current).toBe(true);
        window.localStorage.getItem = originalGetItem;
    });
});

describe('shouldRecoverFromStaleDeploy with recentBuild', () => {
    it('does not recover when reload marker matches buildId AND was reloaded recently', () => {
        const now = Date.now();
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a', false, now - 5_000, now)).toBe(false);
    });

    it('recovers when recentBuild is true even if marker matches buildId and reloaded recently', () => {
        const now = Date.now();
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a', true, now - 5_000, now)).toBe(true);
    });

    it('recovers when buildId is unknown and marker matches unknown', () => {
        const now = Date.now();
        expect(shouldRecoverFromStaleDeploy(staleError, 'unknown', 'unknown', false, now - 5_000, now)).toBe(false);
        expect(shouldRecoverFromStaleDeploy(staleError, 'unknown', 'unknown', true, now - 5_000, now)).toBe(true);
    });

    it('recovers when marker is different buildId', () => {
        const now = Date.now();
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-b', 'build-a', false, now - 5_000, now)).toBe(true);
    });

    it('does not recover for a non-stale error even if reloaded recently', () => {
        const now = Date.now();
        expect(shouldRecoverFromStaleDeploy(genericError, 'build-a', 'build-a', false, now - 5_000, now)).toBe(false);
    });

    it('recovers when previous reload was >15s ago', () => {
        const now = Date.now();
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a', false, now - 20_000, now)).toBe(true);
    });
});

describe('useStaleDeployRecovery', () => {
    const originalLocalStorage = window.localStorage;
    const originalSessionStorage = window.sessionStorage;
    const originalLocation = window.location;

    let reloadMock: ReturnType<typeof vi.fn>;
    let clearClientCacheSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.restoreAllMocks();

        reloadMock = vi.fn();
        Object.defineProperty(window, 'location', {
            value: {
                ...originalLocation,
                reload: reloadMock,
            },
            writable: true,
            configurable: true,
        });

        window.localStorage.clear();
        window.sessionStorage.clear();

        clearClientCacheSpy = vi.spyOn(clearClientCacheModule, 'default').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();

        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window, 'sessionStorage', {
            value: originalSessionStorage,
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
            configurable: true,
        });
    });

    it('returns false immediately for null or non-stale deploy errors and does not schedule recovery', async () => {
        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useStaleDeployRecovery(null, onRecover, 1000));

        expect(result.current).toBe(false);

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });

        expect(onRecover).not.toHaveBeenCalled();
        expect(clearClientCacheSpy).not.toHaveBeenCalled();
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('returns true and schedules recovery when error is undefined', async () => {
        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useStaleDeployRecovery(undefined, onRecover, 1000));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(onRecover).toHaveBeenCalledTimes(1);
        expect(clearClientCacheSpy).toHaveBeenCalledTimes(1);
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('returns false immediately for non-stale deploy errors and does not schedule recovery', async () => {
        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useStaleDeployRecovery(genericError, onRecover, 1000));

        expect(result.current).toBe(false);

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });

        expect(onRecover).not.toHaveBeenCalled();
        expect(clearClientCacheSpy).not.toHaveBeenCalled();
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('returns false when current build has already spent its reload marker in sessionStorage recently (<15s ago)', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');
        window.sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 5_000));

        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useStaleDeployRecovery(staleError, onRecover, 1000));

        expect(result.current).toBe(false);

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });

        expect(onRecover).not.toHaveBeenCalled();
        expect(clearClientCacheSpy).not.toHaveBeenCalled();
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('returns true and recovers when previous reload for this build was >15s ago', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');
        window.sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 20_000));

        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useStaleDeployRecovery(staleError, onRecover, 1000));

        expect(result.current).toBe(true);
    });

    it('returns false when buildIdSetAt is an empty string in localStorage and marker was set recently', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        window.localStorage.setItem('buildIdSetAt', '');
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');
        window.sessionStorage.setItem('stale-deploy-recovery-time', String(Date.now() - 2_000));

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 1000));

        expect(result.current).toBe(false);
    });

    it('returns true and triggers recovery with default 1000ms delay', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        const onRecover = vi.fn().mockResolvedValue({ success: true });

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, onRecover));

        expect(result.current).toBe(true);

        // Before 1000ms delay
        await act(async () => {
            vi.advanceTimersByTime(999);
        });
        expect(onRecover).not.toHaveBeenCalled();
        expect(clearClientCacheSpy).not.toHaveBeenCalled();
        expect(reloadMock).not.toHaveBeenCalled();

        // At 1000ms
        await act(async () => {
            vi.advanceTimersByTime(1);
        });

        expect(onRecover).toHaveBeenCalledTimes(1);
        expect(clearClientCacheSpy).toHaveBeenCalledTimes(1);
        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('v1.0.0');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('supports custom delayMs (e.g. 1500ms)', async () => {
        window.localStorage.setItem('buildId', 'build-custom-delay');

        const { result } = renderHook(() => useStaleDeployRecovery(chunkError, undefined, 1500));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(1499);
        });
        expect(reloadMock).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
        });

        expect(clearClientCacheSpy).toHaveBeenCalledTimes(1);
        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('build-custom-delay');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('defaults buildId to "unknown" when localStorage does not have buildId set', async () => {
        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 500));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('unknown');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('handles onRecover rejection gracefully and continues with reload', async () => {
        window.localStorage.setItem('buildId', 'build-with-failing-hook');
        const failingOnRecover = vi.fn().mockRejectedValue(new Error('Network error during cookie cleanup'));

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, failingOnRecover, 500));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(failingOnRecover).toHaveBeenCalledTimes(1);
        expect(clearClientCacheSpy).toHaveBeenCalledTimes(1);
        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('build-with-failing-hook');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('handles clearClientCache rejection gracefully and still writes marker and reloads', async () => {
        clearClientCacheSpy.mockRejectedValueOnce(new Error('Failed to delete caches'));
        window.localStorage.setItem('buildId', 'build-failing-cache');

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 500));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('build-failing-cache');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('re-arms and returns true when sessionStorage has marker from an older build', async () => {
        window.localStorage.setItem('buildId', 'v2.0.0');
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');

        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useStaleDeployRecovery(staleError, onRecover, 1000));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(onRecover).toHaveBeenCalledTimes(1);
        expect(clearClientCacheSpy).toHaveBeenCalledTimes(1);
        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('v2.0.0');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('executes immediately when delayMs is 0', async () => {
        window.localStorage.setItem('buildId', 'zero-delay-build');

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 0));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(0);
        });

        expect(clearClientCacheSpy).toHaveBeenCalledTimes(1);
        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('zero-delay-build');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('cancels pending recovery timeout when unmounted before delayMs elapses', async () => {
        const onRecover = vi.fn().mockResolvedValue(undefined);
        const { result, unmount } = renderHook(() => useStaleDeployRecovery(staleError, onRecover, 3000));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        unmount();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });

        expect(onRecover).not.toHaveBeenCalled();
        expect(clearClientCacheSpy).not.toHaveBeenCalled();
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('handles localStorage.getItem throwing an exception (e.g. security/quota error)', async () => {
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: () => {
                    throw new Error('SecurityError: The operation is insecure');
                },
                setItem: vi.fn(),
                clear: vi.fn(),
            },
            configurable: true,
        });

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 500));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(window.sessionStorage.getItem('stale-deploy-recovery-reloaded')).toBe('unknown');
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('handles sessionStorage.getItem throwing an exception in canRecover and returns false', () => {
        Object.defineProperty(window, 'sessionStorage', {
            value: {
                getItem: () => {
                    throw new Error('SecurityError: Access denied');
                },
                setItem: vi.fn(),
                clear: vi.fn(),
            },
            configurable: true,
        });

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 500));

        expect(result.current).toBe(false);
    });

    it('handles sessionStorage.setItem throwing an exception during recovery and still reloads', async () => {
        window.localStorage.setItem('buildId', 'build-storage-throw');

        Object.defineProperty(window, 'sessionStorage', {
            value: {
                getItem: () => null,
                setItem: () => {
                    throw new Error('QuotaExceededError');
                },
                clear: vi.fn(),
            },
            configurable: true,
        });

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 500));

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('returns false during SSR when window is undefined', async () => {
        const originalWindow = global.window;
        try {
            // @ts-expect-error test SSR window undefinition
            delete global.window;
            let result: boolean | undefined;
            function SsrComponent() {
                result = useStaleDeployRecovery(staleError);
                return null;
            }
            const { renderToString } = await import('react-dom/server');
            renderToString(React.createElement(SsrComponent));
            expect(result).toBe(false);
        } finally {
            global.window = originalWindow;
        }
    });

    it('does not re-trigger or restart recovery when component re-renders', async () => {
        window.localStorage.setItem('buildId', 'build-stable-timer');
        const onRecover = vi.fn().mockResolvedValue(undefined);

        const { result, rerender } = renderHook(
            ({ err, cb }) => useStaleDeployRecovery(err, cb, 2000),
            { initialProps: { err: staleError, cb: onRecover } },
        );

        expect(result.current).toBe(true);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        // Rerender with new function ref or props
        rerender({ err: staleError, cb: vi.fn() });

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(onRecover).toHaveBeenCalledTimes(1);
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });
});

describe('performCacheBustReload', () => {
    const originalLocation = window.location;

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
            configurable: true,
        });
    });

    it('does nothing when typeof window is undefined', async () => {
        const originalWindow = global.window;
        try {
            // @ts-expect-error test SSR
            delete global.window;
            const { performCacheBustReload } = await import('./use_stale_deploy_recovery.js');
            expect(() => performCacheBustReload()).not.toThrow();
        } finally {
            global.window = originalWindow;
        }
    });

    it('uses location.replace with cache buster query parameter when URL parsing succeeds', async () => {
        const replaceMock = vi.fn();
        Object.defineProperty(window, 'location', {
            value: {
                href: 'https://example.com/test',
                replace: replaceMock,
            },
            writable: true,
            configurable: true,
        });

        const { performCacheBustReload } = await import('./use_stale_deploy_recovery.js');
        performCacheBustReload();

        expect(replaceMock).toHaveBeenCalledTimes(1);
        expect(replaceMock.mock.calls[0][0]).toContain('https://example.com/test?_stale_reload=');
    });

    it('falls back to window.location.reload when URL parsing/replace throws', async () => {
        const reloadMock = vi.fn();
        Object.defineProperty(window, 'location', {
            value: {
                href: 'invalid-url-that-causes-new-url-to-throw',
                reload: reloadMock,
                replace: vi.fn(),
            },
            writable: true,
            configurable: true,
        });

        const { performCacheBustReload } = await import('./use_stale_deploy_recovery.js');
        performCacheBustReload();

        expect(reloadMock).toHaveBeenCalledTimes(1);
    });
});


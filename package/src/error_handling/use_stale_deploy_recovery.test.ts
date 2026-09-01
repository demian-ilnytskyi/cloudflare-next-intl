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

    it('does not recover when this build already reloaded once (marker matches buildId)', () => {
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a')).toBe(false);
    });

    it('re-arms and recovers after a redeploy (marker is old build id)', () => {
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-b', 'build-a')).toBe(true);
    });

    it('never recovers for an unrelated generic error', () => {
        expect(shouldRecoverFromStaleDeploy(genericError, 'build-a', null)).toBe(false);
        expect(shouldRecoverFromStaleDeploy(genericError, 'build-b', 'build-a')).toBe(false);
    });

    it('recovers when error is undefined (aborted RSC stream with missing error)', () => {
        expect(shouldRecoverFromStaleDeploy(undefined, 'build-a', null)).toBe(true);
        expect(shouldRecoverFromStaleDeploy(undefined, 'build-a', 'build-a')).toBe(false);
        expect(shouldRecoverFromStaleDeploy(undefined, 'build-a', 'build-a', true)).toBe(false);
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
});

describe('shouldRecoverFromStaleDeploy with recentBuild', () => {
    it('does not recover when reload marker already matches buildId', () => {
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a', true)).toBe(false);
    });

    it('does not recover for a non-stale error even if the build is recent', () => {
        expect(shouldRecoverFromStaleDeploy(genericError, 'build-a', 'build-a', true)).toBe(false);
    });

    it('defaults recentBuild parameter to false when omitted', () => {
        expect(shouldRecoverFromStaleDeploy(staleError, 'build-a', 'build-a')).toBe(false);
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

    it('returns false when current build has already spent its reload marker in sessionStorage and build is not recent', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        window.localStorage.setItem('buildIdSetAt', String(Date.now() - 120_000)); // 2 minutes ago (past 60s window)
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');

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

    it('returns false when current build already has marker in sessionStorage even if build was set recently (<60s)', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        window.localStorage.setItem('buildIdSetAt', String(Date.now() - 5_000)); // 5 seconds ago (within 60s window)
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');

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

    it('returns false when buildIdSetAt is an empty string in localStorage and marker matches', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        window.localStorage.setItem('buildIdSetAt', '');
        window.sessionStorage.setItem('stale-deploy-recovery-reloaded', 'v1.0.0');

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, undefined, 1000));

        expect(result.current).toBe(false);
    });

    it('returns true and triggers recovery with default 5000ms delay', async () => {
        window.localStorage.setItem('buildId', 'v1.0.0');
        const onRecover = vi.fn().mockResolvedValue({ success: true });

        const { result } = renderHook(() => useStaleDeployRecovery(staleError, onRecover));

        expect(result.current).toBe(true);

        // Before 5000ms delay
        await act(async () => {
            vi.advanceTimersByTime(4999);
        });
        expect(onRecover).not.toHaveBeenCalled();
        expect(clearClientCacheSpy).not.toHaveBeenCalled();
        expect(reloadMock).not.toHaveBeenCalled();

        // At 5000ms
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


import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import ClarityScript from './clarity_script.js';

const clarityInit = vi.fn();
const clarityConsent = vi.fn();
vi.mock('@microsoft/clarity', () => ({
    default: { init: clarityInit, consent: clarityConsent },
}));

beforeEach(() => {
    // ClarityScript defers its init to idle; run the callback inline so the
    // assertions below stay synchronous instead of racing waitFor's timeout.
    (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback =
        (cb: () => void) => { cb(); return 0; };
});

afterEach(() => {
    cleanup();
    clarityInit.mockClear();
    clarityConsent.mockClear();
});

describe('ClarityScript', () => {
    it('loads and initializes clarity with the given projectId', async () => {
        render(<ClarityScript projectId="proj-123" />);
        await waitFor(() => expect(clarityInit).toHaveBeenCalledWith('proj-123'));
        expect(clarityConsent).toHaveBeenCalled();
    });

    it('caches the module import across mounts', async () => {
        const { unmount } = render(<ClarityScript projectId="proj-1" />);
        await waitFor(() => expect(clarityInit).toHaveBeenCalledWith('proj-1'));
        unmount();

        render(<ClarityScript projectId="proj-2" />);
        await waitFor(() => expect(clarityInit).toHaveBeenCalledWith('proj-2'));
        expect(clarityInit).toHaveBeenCalledTimes(2);
    });

    it('falls back to a timer when requestIdleCallback is unavailable', async () => {
        vi.useFakeTimers();
        delete (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback;
        try {
            render(<ClarityScript projectId="proj-timer" />);
            expect(clarityInit).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1500);
            expect(clarityInit).toHaveBeenCalledWith('proj-timer');
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancels a pending idle callback on unmount, without initializing', () => {
        const cancelIdleCallback = vi.fn();
        (window as Window & {
            requestIdleCallback?: (cb: () => void) => number;
            cancelIdleCallback?: (handle: number) => void;
        }).requestIdleCallback = () => 42;
        (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback = cancelIdleCallback;
        const { unmount } = render(<ClarityScript projectId="proj-cancel" />);
        unmount();
        expect(cancelIdleCallback).toHaveBeenCalledWith(42);
        expect(clarityInit).not.toHaveBeenCalled();
    });

    it('clears the fallback timer on unmount so a deferred init never fires', async () => {
        vi.useFakeTimers();
        delete (window as Window & { requestIdleCallback?: unknown }).requestIdleCallback;
        try {
            const { unmount } = render(<ClarityScript projectId="proj-clear" />);
            unmount();
            await vi.advanceTimersByTimeAsync(1500);
            expect(clarityInit).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('logs an error when loading clarity fails', async () => {
        vi.resetModules();
        vi.doMock('@microsoft/clarity', () => Promise.reject(new Error('load failed')));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { default: FreshClarityScript } = await import('./clarity_script.js');
        render(<FreshClarityScript projectId="proj-123" />);
        await waitFor(() => expect(errorSpy).toHaveBeenCalled());
        errorSpy.mockRestore();
        vi.doUnmock('@microsoft/clarity');
    });
});

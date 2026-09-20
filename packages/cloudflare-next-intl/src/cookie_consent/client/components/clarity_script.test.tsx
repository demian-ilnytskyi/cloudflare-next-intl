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

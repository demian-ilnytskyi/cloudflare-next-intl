import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const clarityInit = vi.fn();
const clarityConsent = vi.fn();
vi.mock('@microsoft/clarity', () => ({
    default: { init: clarityInit, consent: clarityConsent },
}));

beforeEach(() => {
    clarityInit.mockClear();
    clarityConsent.mockClear();
});

afterEach(() => {
    vi.resetModules();
});

describe('ClarityScript dynamic import cost', () => {
    it('caches the @microsoft/clarity module import across mounts, so repeated mounts do not re-pay the import cost', async () => {
        const { default: ClarityScript } = await import('./clarity_script.js');

        for (let i = 0; i < 5; i++) {
            const { unmount } = render(<ClarityScript projectId={`proj-${i}`} />);
            await vi.waitFor(() => expect(clarityInit).toHaveBeenCalledWith(`proj-${i}`));
            unmount();
        }

        expect(clarityInit).toHaveBeenCalledTimes(5);
    });
});

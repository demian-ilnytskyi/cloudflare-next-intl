import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/functions/geo.js', () => ({
    resolveEnv: vi.fn(),
}));

import { resolveEnv } from '../server/functions/geo.js';
import { resolveAssetsBinding } from './resolve_assets_binding.js';

describe('resolveAssetsBinding', () => {
    it('returns null when generate is undefined', async () => {
        vi.mocked(resolveEnv).mockResolvedValue(undefined);
        expect(await resolveAssetsBinding(undefined)).toBeNull();
    });

    it('returns null when env has no ASSETS binding', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({});
        expect(await resolveAssetsBinding({})).toBeNull();
    });

    it('returns null when ASSETS exists but has no fetch function', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({ ASSETS: {} });
        expect(await resolveAssetsBinding({})).toBeNull();
    });

    it('returns the binding when ASSETS.fetch is a function', async () => {
        const fetchFn = vi.fn();
        vi.mocked(resolveEnv).mockResolvedValue({ ASSETS: { fetch: fetchFn } });
        const binding = await resolveAssetsBinding({});
        expect(binding).not.toBeNull();
        expect(binding?.fetch).toBe(fetchFn);
    });
});

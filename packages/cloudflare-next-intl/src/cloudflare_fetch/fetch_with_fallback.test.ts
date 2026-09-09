import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./resolve_assets_binding.js', () => ({
    resolveAssetsBinding: vi.fn(),
}));

import { resolveAssetsBinding } from './resolve_assets_binding.js';
import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';

describe('fetchWithCloudflareFallback', () => {
    const originalFetch = globalThis.fetch;
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => new Response('via global fetch'));
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('uses the Assets binding when one is available', async () => {
        const bindingFetch = vi.fn(async () => new Response('via binding'));
        vi.mocked(resolveAssetsBinding).mockResolvedValue({ fetch: bindingFetch });

        const response = await fetchWithCloudflareFallback('https://example.com/a.txt', { headers: { x: '1' } }, {});

        expect(bindingFetch).toHaveBeenCalledWith('https://example.com/a.txt', { headers: { x: '1' } });
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(await response.text()).toBe('via binding');
    });

    it('falls back to global fetch with cache: "no-store" when no binding is available', async () => {
        vi.mocked(resolveAssetsBinding).mockResolvedValue(null);

        const response = await fetchWithCloudflareFallback('https://example.com/a.txt', { headers: { x: '1' } }, {});

        expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/a.txt', { headers: { x: '1' }, cache: 'no-store' });
        expect(await response.text()).toBe('via global fetch');
    });
});

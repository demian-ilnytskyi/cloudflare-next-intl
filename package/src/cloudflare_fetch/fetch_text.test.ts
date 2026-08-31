import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./fetch_with_fallback.js', () => ({
    fetchWithCloudflareFallback: vi.fn(),
}));
vi.mock('../error_handling/report_error.js', () => ({
    default: vi.fn(),
}));

import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';
import reportError from '../error_handling/report_error.js';
import { fetchText } from './fetch_text.js';

describe('fetchText', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the body text on a 200 response', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockResolvedValue(new Response('hello', { status: 200 }));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBe('hello');
        expect(reportError).not.toHaveBeenCalled();
    });

    it('reports and returns null on a non-ok response', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockResolvedValue(new Response('server error', { status: 500 }));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBeNull();
        expect(reportError).toHaveBeenCalledTimes(1);
        const [, params] = vi.mocked(reportError).mock.calls[0];
        expect(params.classOrMethodName).toBe('test.fetchText');
    });

    it('reports and returns null when the fetch itself throws', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockRejectedValue(new Error('network down'));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBeNull();
        expect(reportError).toHaveBeenCalledTimes(1);
    });

    it('handles non-ok response with empty body', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockResolvedValue(new Response('', { status: 500 }));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBeNull();
        expect(reportError).toHaveBeenCalledTimes(1);
    });

    it('passes config.generate through to fetchWithCloudflareFallback when config is provided', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockResolvedValue(new Response('hello', { status: 200 }));
        const generate = {};
        await fetchText('https://example.com/a.txt', {}, { generate }, 'test.fetchText');
        expect(fetchWithCloudflareFallback).toHaveBeenCalledWith('https://example.com/a.txt', {}, generate);
    });
});

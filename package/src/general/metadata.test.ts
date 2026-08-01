import { describe, it, expect, vi, beforeEach } from 'vitest';
import { iAlternatesLinks, languages } from './metadata';

describe('languages', () => {
    it('builds per-locale URLs plus x-default', () => {
        const result = languages('https://example.com', '/about');
        expect(result).toEqual({
            'x-default': 'https://example.com/about',
            en: 'https://example.com/about',
            de: 'https://example.com/de/about',
        });
    });

    it('omits the link part when not provided', () => {
        const result = languages('https://example.com');
        expect(result['x-default']).toBe('https://example.com');
    });
});

describe('iAlternatesLinks', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('sets canonical for the default locale root path', () => {
        const result = iAlternatesLinks({ url: 'https://example.com', locale: 'en', linkPart: '/' });
        expect(result?.canonical).toBe('https://example.com');
    });

    it('sets canonical with linkPart appended for default locale', () => {
        const result = iAlternatesLinks({ url: 'https://example.com', locale: 'en', linkPart: '/about' });
        expect(result?.canonical).toBe('https://example.com/about');
    });

    it('leaves canonical undefined for a non-default locale', () => {
        const result = iAlternatesLinks({ url: 'https://example.com', locale: 'de', linkPart: '/about' });
        expect(result?.canonical).toBeUndefined();
    });

    it('uses the explicit canonical override when provided', () => {
        const result = iAlternatesLinks({
            url: 'https://example.com',
            locale: 'de',
            canonical: 'https://example.com/custom',
        });
        expect(result?.canonical).toBe('https://example.com/custom');
    });

    it('returns undefined and logs on internal error', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: { locales: null, defaultLocale: 'en' } }));
        const { iAlternatesLinks: brokenAlternatesLinks } = await import('./metadata');
        const result = brokenAlternatesLinks({ url: 'https://example.com', locale: 'en' });
        expect(result).toBeUndefined();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('alternatesLinks failed'), expect.any(Error));
        vi.doUnmock('@intl-config');
        vi.resetModules();
    });
});

import { describe, it, expect, vi } from 'vitest';
import resolveRequiresConsent, { defaultGdprCountries } from './gdpr_countries';
import type { CookieConsentGetCloudflareContext } from '../types/types';

describe('resolveRequiresConsent', () => {
    it('requires consent when neither getter is provided and no request headers are available (fail-safe default)', async () => {
        expect(await resolveRequiresConsent(undefined, undefined, undefined)).toBe(true);
    });

    it('falls back to the built-in geo resolution when neither getter is provided', async () => {
        vi.doMock('next/headers', () => ({
            headers: async () => new Headers({ 'cf-ipcountry': 'UA' }),
        }));
        vi.resetModules();
        const resolve = (await import('./gdpr_countries')).default;
        expect(await resolve(undefined, undefined, undefined)).toBe(false);
        vi.doUnmock('next/headers');
        vi.resetModules();
    });

    it('reads a custom country header name in the built-in geo fallback', async () => {
        vi.doMock('next/headers', () => ({
            headers: async () => new Headers({ 'x-country': 'UA' }),
        }));
        vi.resetModules();
        const resolve = (await import('./gdpr_countries')).default;
        expect(await resolve(undefined, undefined, undefined, undefined, ['x-country'])).toBe(false);
        vi.doUnmock('next/headers');
        vi.resetModules();
    });

    it('requires consent when the built-in geo fallback resolves a GDPR country', async () => {
        vi.doMock('next/headers', () => ({
            headers: async () => new Headers({ 'cf-ipcountry': 'DE' }),
        }));
        vi.resetModules();
        const resolve = (await import('./gdpr_countries')).default;
        expect(await resolve(undefined, undefined, undefined)).toBe(true);
        vi.doUnmock('next/headers');
        vi.resetModules();
    });

    it('requires consent when getCountryCode resolves no country', async () => {
        expect(await resolveRequiresConsent(() => undefined, undefined, undefined)).toBe(true);
    });

    it('requires consent when getCountryCode resolves a country inside the default GDPR list', async () => {
        expect(await resolveRequiresConsent(() => 'DE', undefined, undefined)).toBe(true);
    });

    it('does not require consent when getCountryCode resolves a country outside the default GDPR list', async () => {
        expect(await resolveRequiresConsent(() => 'US', undefined, undefined)).toBe(false);
    });

    it('supports an async getCountryCode', async () => {
        expect(await resolveRequiresConsent(async () => 'US', undefined, undefined)).toBe(false);
    });

    it('requires consent when the resolved getCloudflareContext has no cf.country', async () => {
        expect(await resolveRequiresConsent(undefined, () => ({}), undefined)).toBe(true);
    });

    it('requires consent when getCloudflareContext resolves null (e.g. @opennextjs/cloudflare outside a Cloudflare runtime)', async () => {
        expect(await resolveRequiresConsent(undefined, () => null, undefined)).toBe(true);
    });

    it('supports an async getCloudflareContext resolving null', async () => {
        expect(await resolveRequiresConsent(undefined, async () => null, undefined)).toBe(true);
    });

    it('requires consent when getCloudflareContext resolves cf.country inside the default GDPR list', async () => {
        expect(await resolveRequiresConsent(undefined, () => ({ cf: { country: 'DE' } }), undefined)).toBe(true);
    });

    it('does not require consent when getCloudflareContext resolves cf.country outside the default GDPR list', async () => {
        expect(await resolveRequiresConsent(undefined, () => ({ cf: { country: 'US' } }), undefined)).toBe(false);
    });

    it('supports an async getCloudflareContext', async () => {
        expect(await resolveRequiresConsent(undefined, async () => ({ cf: { country: 'US' } }), undefined)).toBe(false);
    });

    it('prefers getCountryCode over getCloudflareContext when both are set', async () => {
        expect(await resolveRequiresConsent(() => 'US', () => ({ cf: { country: 'DE' } }), undefined)).toBe(false);
    });

    it('honors a custom gdprCountries list with getCountryCode and reuses cache', async () => {
        const customList = ['US'] as const;
        expect(await resolveRequiresConsent(() => 'US', undefined, customList)).toBe(true);
        expect(await resolveRequiresConsent(() => 'DE', undefined, customList)).toBe(false);
    });

    it('requires consent and reports when getCloudflareContext throws', async () => {
        const onError = vi.fn();
        const boom = new Error('boom');
        const getCloudflareContext = vi.fn((options?: { async?: boolean }) => {
            if (options?.async) throw boom;
            return null;
        }) as unknown as CookieConsentGetCloudflareContext;
        expect(await resolveRequiresConsent(undefined, getCloudflareContext, undefined, { onError })).toBe(true);
        expect(onError).toHaveBeenCalledWith({ error: boom, classOrMethodName: 'resolveRequiresConsent', params: undefined, isClient: undefined, consent: undefined, formattedMessage: expect.stringContaining('[resolveRequiresConsent] Error:') });
    });

    it('exposes the default GDPR country list', () => {
        expect(defaultGdprCountries).toContain('DE');
        expect(defaultGdprCountries).toContain('GB');
        expect(defaultGdprCountries).toContain('CH');
        expect(defaultGdprCountries).not.toContain('US');
    });
});

import { describe, it, expect } from 'vitest';
import resolveRequiresConsent, { defaultGdprCountries } from './gdpr_countries';

describe('resolveRequiresConsent', () => {
    it('does not require consent when neither getter is provided (gating off by default)', async () => {
        expect(await resolveRequiresConsent(undefined, undefined, undefined)).toBe(false);
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

    it('honors a custom gdprCountries list with getCountryCode', async () => {
        expect(await resolveRequiresConsent(() => 'US', undefined, ['US'])).toBe(true);
        expect(await resolveRequiresConsent(() => 'DE', undefined, ['US'])).toBe(false);
    });

    it('exposes the default GDPR country list', () => {
        expect(defaultGdprCountries).toContain('DE');
        expect(defaultGdprCountries).toContain('GB');
        expect(defaultGdprCountries).toContain('CH');
        expect(defaultGdprCountries).not.toContain('US');
    });
});

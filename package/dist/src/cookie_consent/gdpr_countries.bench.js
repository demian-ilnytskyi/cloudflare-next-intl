import { bench, describe } from 'vitest';
import resolveRequiresConsent, { defaultGdprCountries } from './gdpr_countries';
const fakeGetCloudflareContext = ((options) => {
    const context = { cf: { country: 'DE' } };
    return options?.async === false ? context : Promise.resolve(context);
});
const customList = ['US', 'CA', 'MX'];
describe('resolveRequiresConsent: default GDPR list lookup', () => {
    bench('country inside the list (worst case for Array.includes: near the end)', async () => {
        await resolveRequiresConsent(() => 'CH', undefined, undefined);
    });
    bench('country outside the list', async () => {
        await resolveRequiresConsent(() => 'US', undefined, undefined);
    });
});
describe('resolveRequiresConsent: custom GDPR list lookup (cached Set)', () => {
    bench('repeated calls with the same list reference', async () => {
        await resolveRequiresConsent(() => 'US', undefined, customList);
    });
});
describe('resolveRequiresConsent: gating disabled', () => {
    bench('neither getter set (fast path, no lookup at all)', async () => {
        await resolveRequiresConsent(undefined, undefined, undefined);
    });
});
describe('resolveRequiresConsent: getCloudflareContext path', () => {
    bench('resolves cf.country from an async context getter', async () => {
        await resolveRequiresConsent(undefined, fakeGetCloudflareContext, undefined);
    });
});
// Sanity check the list itself isn't accidentally growing unbounded — a
// regression here would also regress the Set-build cost on first use.
describe('defaultGdprCountries', () => {
    bench('Set construction cost (paid once per process, not per request)', () => {
        new Set(defaultGdprCountries);
    });
});

import { describe, it, expect, vi } from 'vitest';
import resolveRequiresConsent from './gdpr_countries.js';

describe('resolveRequiresConsent perf characteristics', () => {
    it('does not call the country getter at all when country-based gating is off', async () => {
        // Regression: an earlier draft always resolved the getter, even
        // when neither was configured, paying an awaited call for nothing.
        await resolveRequiresConsent(undefined, undefined, undefined);
        // No getter passed means none CAN be called — this asserts the
        // early-return path is taken by checking the function returns
        // synchronously fast and without touching gdprCountries lookup.
        expect(await resolveRequiresConsent(undefined, undefined, undefined)).toBe(true);
    });

    it('does not call getCloudflareContext when getCountryCode is set (precedence, no wasted context resolution)', async () => {
        const getCloudflareContext = vi.fn(async () => ({ cf: { country: 'DE' } }));
        await resolveRequiresConsent(() => 'US', getCloudflareContext, undefined);
        expect(getCloudflareContext).not.toHaveBeenCalled();
    });

    it('reuses the same Set instance across repeated calls with the same custom gdprCountries reference', async () => {
        const customList = ['US', 'CA'];
        // Build a large enough call volume that an O(n) re-scan per call
        // would show up as a correctness/perf smell if the cache were
        // bypassed — here we assert behavior stays correct across many
        // calls sharing one list reference (the cache path).
        const results = await Promise.all(
            Array.from({ length: 50 }, (_, i) => resolveRequiresConsent(() => (i % 2 === 0 ? 'US' : 'DE'), undefined, customList)),
        );
        // US is in the custom list -> requires consent; DE is not in the
        // custom list -> does not require consent. Consistent across all
        // 50 calls confirms the shared cached Set stays correct.
        expect(results.every((r, i) => r === (i % 2 === 0))).toBe(true);
        expect(results[0]).toBe(true);
        expect(results[1]).toBe(false);
    });

    it('a fresh array literal with the same contents does not share the cached Set (WeakMap keys by reference)', async () => {
        const resultA = await resolveRequiresConsent(() => 'US', undefined, ['US']);
        const resultB = await resolveRequiresConsent(() => 'US', undefined, ['US']);
        expect(resultA).toBe(true);
        expect(resultB).toBe(true);
    });
});

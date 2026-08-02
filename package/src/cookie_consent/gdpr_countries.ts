import type { CookieConsentCloudflareContext } from '../types/types';

/**
 * Default `cookieConsent.gdprCountries` — EU/EEA member states (GDPR),
 * Iceland/Liechtenstein/Norway (EEA), the UK (UK-GDPR), and Switzerland
 * (nFADP). ISO 3166-1 alpha-2.
 */
export const defaultGdprCountries: readonly string[] = [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
    'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL',
    'PT', 'RO', 'SE', 'SI', 'SK',
    'IS', 'LI', 'NO',
    'GB',
    'CH',
];

// `Set.has()` is O(1) vs `Array.includes()`'s O(n) — this runs on every
// request that has country-based gating enabled, so the lookup cost matters.
// Mirrors this package's `localesSet` convention in `config/middleware.ts`.
const defaultGdprCountriesSet = new Set(defaultGdprCountries);

// Custom `gdprCountries` lists are typically static config passed at
// `setIntlConfig` call time (module-scope, stable reference) — caching one
// Set per distinct array reference avoids rebuilding it on every request
// while still supporting a caller that legitimately swaps the array.
const customGdprCountriesSetCache = new WeakMap<readonly string[], Set<string>>();

function getGdprCountriesSet(gdprCountries: readonly string[] | undefined): Set<string> {
    if (!gdprCountries) return defaultGdprCountriesSet;
    let set = customGdprCountriesSetCache.get(gdprCountries);
    if (!set) {
        set = new Set(gdprCountries);
        customGdprCountriesSetCache.set(gdprCountries, set);
    }
    return set;
}

/**
 * Resolves whether the cookie-consent banner is required for a visitor.
 *
 * - Neither getter set: country-based gating is off entirely — consent is
 *   never required (the simplest opt-in-by-default setup).
 * - Either getter set: fail-safe — a country that couldn't be resolved
 *   still requires consent; only a resolved country OUTSIDE
 *   `gdprCountries` skips the banner. `getCountryCode` takes precedence
 *   over `getCloudflareContext` when both are set.
 */
export default async function resolveRequiresConsent(
    getCountryCode: (() => string | undefined | Promise<string | undefined>) | undefined,
    getCloudflareContext: (() => CookieConsentCloudflareContext | Promise<CookieConsentCloudflareContext>) | undefined,
    gdprCountries: readonly string[] | undefined,
): Promise<boolean> {
    if (!getCountryCode && !getCloudflareContext) return false;

    const countryCode = getCountryCode
        ? await getCountryCode()
        : (await getCloudflareContext!()).cf?.country;

    if (!countryCode) return true;
    return getGdprCountriesSet(gdprCountries).has(countryCode);
}

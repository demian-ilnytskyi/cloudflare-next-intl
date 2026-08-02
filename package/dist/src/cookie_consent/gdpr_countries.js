/**
 * Default `cookieConsent.gdprCountries` — EU/EEA member states (GDPR),
 * Iceland/Liechtenstein/Norway (EEA), the UK (UK-GDPR), and Switzerland
 * (nFADP). ISO 3166-1 alpha-2.
 */
export const defaultGdprCountries = [
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
const customGdprCountriesSetCache = new WeakMap();
function getGdprCountriesSet(gdprCountries) {
    if (!gdprCountries)
        return defaultGdprCountriesSet;
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
 * - Neither getter set: fail-safe — consent is required by default since
 *   the visitor's country can't be determined at all.
 * - Either getter set: fail-safe — a country that couldn't be resolved
 *   still requires consent; only a resolved country OUTSIDE
 *   `gdprCountries` skips the banner. `getCountryCode` takes precedence
 *   over `getCloudflareContext` when both are set.
 */
export default async function resolveRequiresConsent(getCountryCode, getCloudflareContext, gdprCountries) {
    if (!getCountryCode && !getCloudflareContext)
        return true;
    const countryCode = getCountryCode
        ? await getCountryCode()
        : (await getCloudflareContext({ async: true }))?.cf?.country;
    if (typeof countryCode !== 'string' || !countryCode)
        return true;
    return getGdprCountriesSet(gdprCountries).has(countryCode);
}

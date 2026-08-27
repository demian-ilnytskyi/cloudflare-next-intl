import reportError from '../error_handling/report_error';
import { getCountry } from '../server/functions/geo';
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
export default async function resolveRequiresConsent(getCountryCode, getCloudflareContext, gdprCountries, errorHandlingConfig, countryHeaderNames) {
    let countryCode;
    if (getCountryCode) {
        countryCode = await getCountryCode();
    }
    else if (getCloudflareContext) {
        try {
            countryCode = (await getCloudflareContext({ async: true }))?.cf?.country;
        }
        catch (error) {
            await reportError({ errorHandling: errorHandlingConfig, generate: { getCloudflareContext } }, { error, classOrMethodName: 'resolveRequiresConsent' });
            return true;
        }
    }
    // Neither getter supplied (or one resolved nothing): fall back to the
    // package's own geo resolution, which reads the Cloudflare country
    // headers off the current request.
    if (typeof countryCode !== 'string' || !countryCode) {
        try {
            countryCode = await getCountry(undefined, undefined, countryHeaderNames);
        }
        catch {
            return true;
        }
    }
    if (typeof countryCode !== 'string' || !countryCode)
        return true;
    return getGdprCountriesSet(gdprCountries).has(countryCode);
}

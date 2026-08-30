import reportError from '../error_handling/report_error.js';
import { getCountry } from '../server/functions/geo.js';
export const defaultGdprCountries = [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
    'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL',
    'PT', 'RO', 'SE', 'SI', 'SK',
    'IS', 'LI', 'NO',
    'GB',
    'CH',
];
const defaultGdprCountriesSet = new Set(defaultGdprCountries);
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
export default async function resolveRequiresConsent(getCountryCode, getCloudflareContext, gdprCountries, errorHandlingConfig, countryHeaderNames, generateConfig) {
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
    if (typeof countryCode !== 'string' || !countryCode) {
        try {
            countryCode = await getCountry(undefined, generateConfig, countryHeaderNames);
        }
        catch {
            return true;
        }
    }
    if (typeof countryCode !== 'string' || !countryCode)
        return true;
    return getGdprCountriesSet(gdprCountries).has(countryCode);
}

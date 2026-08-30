/** Default request headers read to resolve the visitor's country, in order. */
export const defaultCountryHeaderNames = ['x-cf-country', 'cf-ipcountry'];
/** Default request headers read to resolve the visitor's timezone, in order. */
export const defaultTimezoneHeaderNames = ['x-cf-timezone', 'cf-timezone'];
function extractHeader(h, name) {
    if (typeof h.get === 'function') {
        const val = h.get(name);
        return val ?? undefined;
    }
    const rec = h;
    const val = rec[name] ?? rec[name.toLowerCase()];
    return (typeof val === 'string' && val.length > 0) ? val : undefined;
}
// Read lazily (and tolerantly): `@intl-config` may not be set at all in
// standalone/unit usage of these helpers, and importing the config eagerly
// would risk a cycle with a config module that itself imports from here.
async function configuredGenerate() {
    try {
        const config = (await import('../../config/intl_config.js')).default;
        return config?.generate;
    }
    catch {
        return undefined;
    }
}
function extractFromHeaderNames(h, headerNames) {
    for (const name of headerNames) {
        const val = extractHeader(h, name);
        if (val)
            return val;
    }
    return undefined;
}
/**
 * Resolves the client's ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "UA").
 *
 * Checks in order:
 * 1. Explicit `input` (Request, NextRequest, or Headers) if provided
 * 2. Next.js request headers via `headers()` (`headerNames`, default
 *    `x-cf-country`, `cf-ipcountry`)
 * 3. `generate.ctx` or `generate.getCloudflareContext` or `cf.country` if passed
 * 4. `undefined` if outside request scope or unavailable
 */
export async function getCountry(input, generate, headerNames) {
    const gen = generate ?? await configuredGenerate();
    const names = headerNames
        ?? gen?.countryHeaderNames
        ?? defaultCountryHeaderNames;
    if (input) {
        if ('headers' in input && input.headers) {
            const country = extractFromHeaderNames(input.headers, names);
            if (country)
                return country;
        }
        else if (typeof input.get === 'function') {
            const country = extractFromHeaderNames(input, names);
            if (country)
                return country;
        }
        const cf = input.cf;
        if (cf?.country && typeof cf.country === 'string' && cf.country.length > 0) {
            return cf.country;
        }
    }
    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        const country = extractFromHeaderNames(h, names);
        if (country)
            return country;
    }
    catch {
        // Outside request scope / build time
    }
    if (gen?.ctx) {
        try {
            const context = typeof gen.ctx === 'function' ? await gen.ctx() : gen.ctx;
            const cf = context?.cf;
            if (cf?.country && typeof cf.country === 'string' && cf.country.length > 0) {
                return cf.country;
            }
        }
        catch {
            // Ignore context resolution errors
        }
    }
    if (gen?.getCloudflareContext) {
        try {
            const ctx = await gen.getCloudflareContext({ async: true });
            if (ctx?.cf?.country && typeof ctx.cf.country === 'string' && ctx.cf.country.length > 0) {
                return ctx.cf.country;
            }
        }
        catch {
            // Ignore context resolution errors
        }
    }
    return undefined;
}
/**
 * Resolves the client's IANA timezone string (e.g. "America/New_York", "Europe/Kyiv", "UTC").
 *
 * Checks in order:
 * 1. Explicit `input` (Request, NextRequest, or Headers) if provided
 * 2. Next.js request headers via `headers()` (`headerNames`, default
 *    `x-cf-timezone`, `cf-timezone`)
 * 3. `generate.ctx` or `generate.getCloudflareContext` or `cf.timezone` if passed
 * 4. `fallback` (or `undefined`) if outside request scope or unavailable
 */
export async function getTimezone(input, fallback, generate, headerNames) {
    const gen = generate ?? await configuredGenerate();
    const names = headerNames
        ?? gen?.timezoneHeaderNames
        ?? defaultTimezoneHeaderNames;
    if (input) {
        if ('headers' in input && input.headers) {
            const tz = extractFromHeaderNames(input.headers, names);
            if (tz)
                return tz;
        }
        else if (typeof input.get === 'function') {
            const tz = extractFromHeaderNames(input, names);
            if (tz)
                return tz;
        }
        const cf = input.cf;
        if (cf?.timezone && typeof cf.timezone === 'string' && cf.timezone.length > 0) {
            return cf.timezone;
        }
    }
    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        const tz = extractFromHeaderNames(h, names);
        if (tz)
            return tz;
    }
    catch {
        // Outside request scope
    }
    if (gen?.ctx) {
        try {
            const context = typeof gen.ctx === 'function' ? await gen.ctx() : gen.ctx;
            const cf = context?.cf;
            if (cf?.timezone && typeof cf.timezone === 'string' && cf.timezone.length > 0) {
                return cf.timezone;
            }
        }
        catch {
            // Ignore context resolution errors
        }
    }
    if (gen?.getCloudflareContext) {
        try {
            const ctx = await gen.getCloudflareContext({ async: true });
            if (ctx?.cf?.timezone && typeof ctx.cf.timezone === 'string' && ctx.cf.timezone.length > 0) {
                return ctx.cf.timezone;
            }
        }
        catch {
            // Ignore context resolution errors
        }
    }
    return fallback;
}
/**
 * Resolves the Cloudflare environment bindings object from `generate.env` or `generate.getCloudflareContext`.
 */
export async function resolveEnv(generate) {
    if (!generate)
        return undefined;
    if (generate.env) {
        const resolved = typeof generate.env === 'function' ? await generate.env() : generate.env;
        return resolved;
    }
    if (generate.getCloudflareContext) {
        try {
            const ctx = await generate.getCloudflareContext({ async: true });
            return ctx?.env;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}

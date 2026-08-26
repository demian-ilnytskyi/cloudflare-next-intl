import config from '../../config/intl_config';
function extractHeader(h, name) {
    if (typeof h.get === 'function') {
        const val = h.get(name);
        return val ?? undefined;
    }
    const rec = h;
    const val = rec[name] ?? rec[name.toLowerCase()];
    return (typeof val === 'string' && val.length > 0) ? val : undefined;
}
/**
 * Resolves the client's ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "UA").
 *
 * Checks in order:
 * 1. Explicit `input` (Request, NextRequest, or Headers) if provided
 * 2. Next.js request headers via `headers()` (`x-cf-country`, `cf-ipcountry`)
 * 3. `config.generate.getCloudflareContext` or `cf.country` if configured
 * 4. `undefined` if outside request scope or unavailable
 */
export async function getCountry(input) {
    if (input) {
        if ('headers' in input && input.headers) {
            const country = extractHeader(input.headers, 'x-cf-country') ?? extractHeader(input.headers, 'cf-ipcountry');
            if (country)
                return country;
        }
        else if (typeof input.get === 'function') {
            const country = input.get('x-cf-country') ?? input.get('cf-ipcountry') ?? undefined;
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
        const country = h.get('x-cf-country') ?? h.get('cf-ipcountry') ?? undefined;
        if (country)
            return country;
    }
    catch {
        // Outside request scope / build time
    }
    if (config?.generate?.getCloudflareContext) {
        try {
            const ctx = await config.generate.getCloudflareContext({ async: true });
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
 * 2. Next.js request headers via `headers()` (`x-cf-timezone`, `cf-timezone`)
 * 3. `config.generate.getCloudflareContext` or `cf.timezone` if configured
 * 4. `fallback` (or `undefined`) if outside request scope or unavailable
 */
export async function getTimezone(input, fallback) {
    if (input) {
        if ('headers' in input && input.headers) {
            const tz = extractHeader(input.headers, 'x-cf-timezone') ?? extractHeader(input.headers, 'cf-timezone');
            if (tz)
                return tz;
        }
        else if (typeof input.get === 'function') {
            const tz = input.get('x-cf-timezone') ?? input.get('cf-timezone') ?? undefined;
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
        const tz = h.get('x-cf-timezone') ?? h.get('cf-timezone') ?? undefined;
        if (tz)
            return tz;
    }
    catch {
        // Outside request scope
    }
    if (config?.generate?.getCloudflareContext) {
        try {
            const ctx = await config.generate.getCloudflareContext({ async: true });
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
    const gen = generate ?? config?.generate;
    if (!gen)
        return undefined;
    if (gen.env) {
        return typeof gen.env === 'function' ? await gen.env() : gen.env;
    }
    if (gen.getCloudflareContext) {
        try {
            const ctx = await gen.getCloudflareContext({ async: true });
            return ctx?.env;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}

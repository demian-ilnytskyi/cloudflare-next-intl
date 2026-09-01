import type { GenerateRoutingConfig, RequestOrHeaders } from '../../types/types.js';
import { countryCookieKey, timezoneCookieKey } from '../../config/cookie_key.js';

/** Default request headers read to resolve the visitor's country, in order. */
export const defaultCountryHeaderNames: readonly string[] = ['x-cf-country', 'cf-ipcountry'];

/** Default request headers read to resolve the visitor's timezone, in order. */
export const defaultTimezoneHeaderNames: readonly string[] = ['x-cf-timezone', 'cf-timezone'];

function extractHeader(h: Headers | Record<string, string | null | undefined>, name: string): string | undefined {
    if (typeof (h as Headers).get === 'function') {
        const val = (h as Headers).get(name);
        return val ?? undefined;
    }
    const rec = h as Record<string, string | null | undefined>;
    const val = rec[name] ?? rec[name.toLowerCase()];
    return (typeof val === 'string' && val.length > 0) ? val : undefined;
}

// Read lazily (and tolerantly): `@intl-config` may not be set at all in
// standalone/unit usage of these helpers, and importing the config eagerly
// would risk a cycle with a config module that itself imports from here.
async function configuredGenerate(): Promise<GenerateRoutingConfig | undefined> {
    try {
        const config = (await import('../../config/intl_config.js')).default;
        return config?.generate;
    } catch {
        return undefined;
    }
}

function extractFromHeaderNames(
    h: Headers | Record<string, string | null | undefined>,
    headerNames: readonly string[],
): string | undefined {
    for (const name of headerNames) {
        const val = extractHeader(h, name);
        if (val) return val;
    }
    return undefined;
}

function extractCookieHeader(
    h: Headers | Record<string, string | null | undefined>,
    name: string,
): string | undefined {
    const cookieHeader = extractHeader(h, 'cookie');
    if (!cookieHeader) return undefined;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        const key = part.slice(0, index).trim();
        if (key !== name) continue;
        const value = part.slice(index + 1).trim();
        return value ? decodeURIComponent(value) : undefined;
    }
    return undefined;
}

function extractCookie(
    cookieStore: { get?: (name: string) => { value?: string } | string | undefined } | undefined,
    name: string,
): string | undefined {
    const cookie = cookieStore?.get?.(name);
    const value = typeof cookie === 'string' ? cookie : cookie?.value;
    return value || undefined;
}

/**
 * Resolves the client's ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "UA").
 *
 * Checks in order:
 * 1. Explicit `input` (Request, NextRequest, or Headers) if provided
 * 2. Next.js request headers via `headers()` (`headerNames`, default
 *    `x-cf-country`, `cf-ipcountry`)
 * 3. Cookies (`__cf_country__`) from the explicit request or request scope
 * 4. `generate.ctx` or `generate.getCloudflareContext` or `cf.country` if passed
 * 5. `undefined` if outside request scope or unavailable
 */
export async function getCountry(
    input?: RequestOrHeaders,
    generate?: GenerateRoutingConfig,
    headerNames?: readonly string[],
): Promise<string | undefined> {
    const gen = generate ?? await configuredGenerate();
    const names = headerNames
        ?? gen?.countryHeaderNames
        ?? defaultCountryHeaderNames;
    if (input) {
        if ('headers' in input && input.headers) {
            const country = extractFromHeaderNames(input.headers, names);
            if (country) return country;
            const cookieCountry = extractCookieHeader(input.headers, countryCookieKey);
            if (cookieCountry) return cookieCountry;
        } else if (typeof (input as Headers).get === 'function') {
            const country = extractFromHeaderNames(input as Headers, names);
            if (country) return country;
            const cookieCountry = extractCookieHeader(input as Headers, countryCookieKey);
            if (cookieCountry) return cookieCountry;
        }
        const cookieCountry = extractCookie((input as { cookies?: { get?: (name: string) => { value?: string } | string | undefined } }).cookies, countryCookieKey);
        if (cookieCountry) {
            return cookieCountry;
        }
        const cf = (input as { cf?: { country?: string } }).cf;
        if (cf?.country && typeof cf.country === 'string' && cf.country.length > 0) {
            return cf.country;
        }
    }

    try {
        const { headers } = await import('next/headers.js');
        const h = await headers();
        const country = extractFromHeaderNames(h, names);
        if (country) return country;
        const cookieCountry = extractCookieHeader(h, countryCookieKey);
        if (cookieCountry) return cookieCountry;
    } catch {
        // Outside request scope / build time
    }

    try {
        const { cookies } = await import('next/headers.js');
        const c = await cookies();
        const country = extractCookie(c, countryCookieKey);
        if (country) return country;
    } catch {
        // Outside request scope / build time
    }

    if (gen?.ctx) {
        try {
            const context = typeof gen.ctx === 'function' ? await gen.ctx() : gen.ctx;
            const cf = (context as { cf?: { country?: string } })?.cf;
            if (cf?.country && typeof cf.country === 'string' && cf.country.length > 0) {
                return cf.country;
            }
        } catch {
            // Ignore context resolution errors
        }
    }

    if (gen?.getCloudflareContext) {
        try {
            const ctx = await gen.getCloudflareContext({ async: true });
            if (ctx?.cf?.country && typeof ctx.cf.country === 'string' && ctx.cf.country.length > 0) {
                return ctx.cf.country;
            }
        } catch {
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
 * 3. Cookies (`__cf_timezone__`) from the explicit request or request scope
 * 4. `generate.ctx` or `generate.getCloudflareContext` or `cf.timezone` if passed
 * 5. `fallback` (or `undefined`) if outside request scope or unavailable
 */
export async function getTimezone(
    input?: RequestOrHeaders,
    fallback?: string,
    generate?: GenerateRoutingConfig,
    headerNames?: readonly string[],
): Promise<string | undefined> {
    const gen = generate ?? await configuredGenerate();
    const names = headerNames
        ?? gen?.timezoneHeaderNames
        ?? defaultTimezoneHeaderNames;
    if (input) {
        if ('headers' in input && input.headers) {
            const tz = extractFromHeaderNames(input.headers, names);
            if (tz) return tz;
            const cookieTimezone = extractCookieHeader(input.headers, timezoneCookieKey);
            if (cookieTimezone) return cookieTimezone;
        } else if (typeof (input as Headers).get === 'function') {
            const tz = extractFromHeaderNames(input as Headers, names);
            if (tz) return tz;
            const cookieTimezone = extractCookieHeader(input as Headers, timezoneCookieKey);
            if (cookieTimezone) return cookieTimezone;
        }
        const cookieTimezone = extractCookie((input as { cookies?: { get?: (name: string) => { value?: string } | string | undefined } }).cookies, timezoneCookieKey);
        if (cookieTimezone) {
            return cookieTimezone;
        }
        const cf = (input as { cf?: { timezone?: string } }).cf;
        if (cf?.timezone && typeof cf.timezone === 'string' && cf.timezone.length > 0) {
            return cf.timezone;
        }
    }

    try {
        const { headers } = await import('next/headers.js');
        const h = await headers();
        const tz = extractFromHeaderNames(h, names);
        if (tz) return tz;
        const cookieTimezone = extractCookieHeader(h, timezoneCookieKey);
        if (cookieTimezone) return cookieTimezone;
    } catch {
        // Outside request scope
    }

    try {
        const { cookies } = await import('next/headers.js');
        const c = await cookies();
        const tz = extractCookie(c, timezoneCookieKey);
        if (tz) return tz;
    } catch {
        // Outside request scope
    }

    if (gen?.ctx) {
        try {
            const context = typeof gen.ctx === 'function' ? await gen.ctx() : gen.ctx;
            const cf = (context as { cf?: { timezone?: string } })?.cf;
            if (cf?.timezone && typeof cf.timezone === 'string' && cf.timezone.length > 0) {
                return cf.timezone;
            }
        } catch {
            // Ignore context resolution errors
        }
    }

    if (gen?.getCloudflareContext) {
        try {
            const ctx = await gen.getCloudflareContext({ async: true });
            if (ctx?.cf?.timezone && typeof ctx.cf.timezone === 'string' && ctx.cf.timezone.length > 0) {
                return ctx.cf.timezone;
            }
        } catch {
            // Ignore context resolution errors
        }
    }

    return fallback;
}

/**
 * Resolves the Cloudflare environment bindings object from `generate.env` or `generate.getCloudflareContext`.
 */
export async function resolveEnv(generate?: GenerateRoutingConfig): Promise<Record<string, unknown> | undefined> {
    if (!generate) return undefined;
    if (generate.env) {
        const resolved = typeof generate.env === 'function' ? await generate.env() : generate.env;
        return resolved as Record<string, unknown>;
    }
    if (generate.getCloudflareContext) {
        try {
            const ctx = await generate.getCloudflareContext({ async: true });
            return (ctx as { env?: Record<string, unknown> })?.env;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

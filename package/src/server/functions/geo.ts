import type { GenerateRoutingConfig, RequestOrHeaders } from '../../types/types';

function extractHeader(h: Headers | Record<string, string | null | undefined>, name: string): string | undefined {
    if (typeof (h as Headers).get === 'function') {
        const val = (h as Headers).get(name);
        return val ?? undefined;
    }
    const rec = h as Record<string, string | null | undefined>;
    const val = rec[name] ?? rec[name.toLowerCase()];
    return (typeof val === 'string' && val.length > 0) ? val : undefined;
}

/**
 * Resolves the client's ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "UA").
 *
 * Checks in order:
 * 1. Explicit `input` (Request, NextRequest, or Headers) if provided
 * 2. Next.js request headers via `headers()` (`x-cf-country`, `cf-ipcountry`)
 * 3. `generate.getCloudflareContext` or `cf.country` if passed
 * 4. `undefined` if outside request scope or unavailable
 */
export async function getCountry(input?: RequestOrHeaders, generate?: GenerateRoutingConfig): Promise<string | undefined> {
    if (input) {
        if ('headers' in input && input.headers) {
            const country = extractHeader(input.headers, 'x-cf-country') ?? extractHeader(input.headers, 'cf-ipcountry');
            if (country) return country;
        } else if (typeof (input as Headers).get === 'function') {
            const country = (input as Headers).get('x-cf-country') ?? (input as Headers).get('cf-ipcountry') ?? undefined;
            if (country) return country;
        }
        const cf = (input as { cf?: { country?: string } }).cf;
        if (cf?.country && typeof cf.country === 'string' && cf.country.length > 0) {
            return cf.country;
        }
    }

    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        const country = h.get('x-cf-country') ?? h.get('cf-ipcountry') ?? undefined;
        if (country) return country;
    } catch {
        // Outside request scope / build time
    }

    if (generate?.getCloudflareContext) {
        try {
            const ctx = await generate.getCloudflareContext({ async: true });
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
 * 2. Next.js request headers via `headers()` (`x-cf-timezone`, `cf-timezone`)
 * 3. `generate.getCloudflareContext` or `cf.timezone` if passed
 * 4. `fallback` (or `undefined`) if outside request scope or unavailable
 */
export async function getTimezone(input?: RequestOrHeaders, fallback?: string, generate?: GenerateRoutingConfig): Promise<string | undefined> {
    if (input) {
        if ('headers' in input && input.headers) {
            const tz = extractHeader(input.headers, 'x-cf-timezone') ?? extractHeader(input.headers, 'cf-timezone');
            if (tz) return tz;
        } else if (typeof (input as Headers).get === 'function') {
            const tz = (input as Headers).get('x-cf-timezone') ?? (input as Headers).get('cf-timezone') ?? undefined;
            if (tz) return tz;
        }
        const cf = (input as { cf?: { timezone?: string } }).cf;
        if (cf?.timezone && typeof cf.timezone === 'string' && cf.timezone.length > 0) {
            return cf.timezone;
        }
    }

    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        const tz = h.get('x-cf-timezone') ?? h.get('cf-timezone') ?? undefined;
        if (tz) return tz;
    } catch {
        // Outside request scope
    }

    if (generate?.getCloudflareContext) {
        try {
            const ctx = await generate.getCloudflareContext({ async: true });
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

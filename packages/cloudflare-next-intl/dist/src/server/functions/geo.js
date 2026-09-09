import { cache } from 'react';
import { countryCookieKey, timezoneCookieKey } from '../../config/cookie_key.js';
export const defaultCountryHeaderNames = ['x-cf-country', 'cf-ipcountry'];
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
function extractCookieHeader(h, name) {
    const cookieHeader = extractHeader(h, 'cookie');
    if (!cookieHeader)
        return undefined;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const index = part.indexOf('=');
        if (index === -1)
            continue;
        const key = part.slice(0, index).trim();
        if (key !== name)
            continue;
        const value = part.slice(index + 1).trim();
        return value ? decodeURIComponent(value) : undefined;
    }
    return undefined;
}
function extractCookie(cookieStore, name) {
    const cookie = cookieStore?.get?.(name);
    const value = typeof cookie === 'string' ? cookie : cookie?.value;
    return value || undefined;
}
export async function getCountry(input, generate, headerNames) {
    const gen = generate ?? await configuredGenerate();
    const names = headerNames
        ?? gen?.countryHeaderNames
        ?? defaultCountryHeaderNames;
    const cookieName = gen?.countryCookieName ?? countryCookieKey;
    if (input) {
        if ('headers' in input && input.headers) {
            const country = extractFromHeaderNames(input.headers, names);
            if (country)
                return country;
            const cookieCountry = extractCookieHeader(input.headers, cookieName);
            if (cookieCountry)
                return cookieCountry;
        }
        else if (typeof input.get === 'function') {
            const country = extractFromHeaderNames(input, names);
            if (country)
                return country;
            const cookieCountry = extractCookieHeader(input, cookieName);
            if (cookieCountry)
                return cookieCountry;
        }
        const cookieCountry = extractCookie(input.cookies, cookieName);
        if (cookieCountry) {
            return cookieCountry;
        }
        const cf = input.cf;
        if (cf?.country && typeof cf.country === 'string' && cf.country.length > 0) {
            return cf.country;
        }
    }
    try {
        const { headers } = await import('next/headers.js');
        const h = await headers();
        const country = extractFromHeaderNames(h, names);
        if (country)
            return country;
        const cookieCountry = extractCookieHeader(h, cookieName);
        if (cookieCountry)
            return cookieCountry;
    }
    catch {
    }
    try {
        const { cookies } = await import('next/headers.js');
        const c = await cookies();
        const country = extractCookie(c, cookieName);
        if (country)
            return country;
    }
    catch {
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
        }
    }
    return undefined;
}
export async function getTimezone(input, fallback, generate, headerNames) {
    const gen = generate ?? await configuredGenerate();
    const names = headerNames
        ?? gen?.timezoneHeaderNames
        ?? defaultTimezoneHeaderNames;
    const cookieName = gen?.timezoneCookieName ?? timezoneCookieKey;
    if (input) {
        if ('headers' in input && input.headers) {
            const tz = extractFromHeaderNames(input.headers, names);
            if (tz)
                return tz;
            const cookieTimezone = extractCookieHeader(input.headers, cookieName);
            if (cookieTimezone)
                return cookieTimezone;
        }
        else if (typeof input.get === 'function') {
            const tz = extractFromHeaderNames(input, names);
            if (tz)
                return tz;
            const cookieTimezone = extractCookieHeader(input, cookieName);
            if (cookieTimezone)
                return cookieTimezone;
        }
        const cookieTimezone = extractCookie(input.cookies, cookieName);
        if (cookieTimezone) {
            return cookieTimezone;
        }
        const cf = input.cf;
        if (cf?.timezone && typeof cf.timezone === 'string' && cf.timezone.length > 0) {
            return cf.timezone;
        }
    }
    try {
        const { headers } = await import('next/headers.js');
        const h = await headers();
        const tz = extractFromHeaderNames(h, names);
        if (tz)
            return tz;
        const cookieTimezone = extractCookieHeader(h, cookieName);
        if (cookieTimezone)
            return cookieTimezone;
    }
    catch {
    }
    try {
        const { cookies } = await import('next/headers.js');
        const c = await cookies();
        const tz = extractCookie(c, cookieName);
        if (tz)
            return tz;
    }
    catch {
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
        }
    }
    return fallback;
}
async function resolveEnvUncached(generate) {
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
export const resolveEnv = cache(resolveEnvUncached);

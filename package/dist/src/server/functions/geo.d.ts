import type { GenerateRoutingConfig, RequestOrHeaders } from '../../types/types.js';
/** Default request headers read to resolve the visitor's country, in order. */
export declare const defaultCountryHeaderNames: readonly string[];
/** Default request headers read to resolve the visitor's timezone, in order. */
export declare const defaultTimezoneHeaderNames: readonly string[];
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
export declare function getCountry(input?: RequestOrHeaders, generate?: GenerateRoutingConfig, headerNames?: readonly string[]): Promise<string | undefined>;
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
export declare function getTimezone(input?: RequestOrHeaders, fallback?: string, generate?: GenerateRoutingConfig, headerNames?: readonly string[]): Promise<string | undefined>;
/**
 * Resolves the Cloudflare environment bindings object from `generate.env` or `generate.getCloudflareContext`.
 */
export declare function resolveEnv(generate?: GenerateRoutingConfig): Promise<Record<string, unknown> | undefined>;

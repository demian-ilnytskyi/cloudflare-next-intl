import type { GenerateRoutingConfig, RequestOrHeaders } from '../../types/types.js';
export declare const defaultCountryHeaderNames: readonly string[];
export declare const defaultTimezoneHeaderNames: readonly string[];
export declare function getCountry(input?: RequestOrHeaders, generate?: GenerateRoutingConfig, headerNames?: readonly string[]): Promise<string | undefined>;
export declare function getTimezone(input?: RequestOrHeaders, fallback?: string, generate?: GenerateRoutingConfig, headerNames?: readonly string[]): Promise<string | undefined>;
export declare function resolveEnv(generate?: GenerateRoutingConfig): Promise<Record<string, unknown> | undefined>;

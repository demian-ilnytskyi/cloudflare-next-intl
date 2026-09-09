import type { CookieConsentGetCloudflareContext, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
export declare const defaultGdprCountries: readonly string[];
export default function resolveRequiresConsent(getCountryCode: (() => string | undefined | Promise<string | undefined>) | undefined, getCloudflareContext: CookieConsentGetCloudflareContext | undefined, gdprCountries: readonly string[] | undefined, errorHandlingConfig?: ErrorHandlingRoutingConfig, countryHeaderNames?: readonly string[], generateConfig?: GenerateRoutingConfig): Promise<boolean>;

import type { CookieConsentGetCloudflareContext, ErrorHandlingRoutingConfig, GenerateRoutingConfig } from '../types/types';
/**
 * Default `cookieConsent.gdprCountries` — EU/EEA member states (GDPR),
 * Iceland/Liechtenstein/Norway (EEA), the UK (UK-GDPR), and Switzerland
 * (nFADP). ISO 3166-1 alpha-2.
 */
export declare const defaultGdprCountries: readonly string[];
export default function resolveRequiresConsent(getCountryCode: (() => string | undefined | Promise<string | undefined>) | undefined, getCloudflareContext: CookieConsentGetCloudflareContext | undefined, gdprCountries: readonly string[] | undefined, errorHandlingConfig?: ErrorHandlingRoutingConfig, countryHeaderNames?: readonly string[], generateConfig?: GenerateRoutingConfig): Promise<boolean>;

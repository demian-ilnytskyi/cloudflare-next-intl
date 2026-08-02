import type { CookieConsentGetCloudflareContext, ErrorHandlingRoutingConfig } from '../types/types';
/**
 * Default `cookieConsent.gdprCountries` — EU/EEA member states (GDPR),
 * Iceland/Liechtenstein/Norway (EEA), the UK (UK-GDPR), and Switzerland
 * (nFADP). ISO 3166-1 alpha-2.
 */
export declare const defaultGdprCountries: readonly string[];
/**
 * Resolves whether the cookie-consent banner is required for a visitor.
 *
 * - Neither getter set: fail-safe — consent is required by default since
 *   the visitor's country can't be determined at all.
 * - Either getter set: fail-safe — a country that couldn't be resolved
 *   still requires consent; only a resolved country OUTSIDE
 *   `gdprCountries` skips the banner. `getCountryCode` takes precedence
 *   over `getCloudflareContext` when both are set.
 */
export default function resolveRequiresConsent(getCountryCode: (() => string | undefined | Promise<string | undefined>) | undefined, getCloudflareContext: CookieConsentGetCloudflareContext | undefined, gdprCountries: readonly string[] | undefined, errorHandlingConfig?: ErrorHandlingRoutingConfig): Promise<boolean>;

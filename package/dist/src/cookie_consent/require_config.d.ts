import type { CookieConsentRoutingConfig } from '../types/types';
/**
 * Throws a descriptive error instead of silently no-op'ing when the
 * `cookie_consent` submodule is used without `cookieConsent` set on the
 * `RoutingConfig` passed to `setIntlConfig`.
 */
export default function requireCookieConsentConfig(value: CookieConsentRoutingConfig | undefined): CookieConsentRoutingConfig;

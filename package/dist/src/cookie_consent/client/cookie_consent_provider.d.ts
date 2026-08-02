import type { CookieConsentContextType } from '../types';
export declare const CookieConsentContext: import("react").Context<CookieConsentContextType | null>;
/**
 * Provides cookie-consent + privacy-policy-update state to
 * `useCookieConsent()` and the default `CookieConsentDialog`/
 * `PrivacyPolicyUpdateDialog` components. Requires `cookieConsent` to be set
 * on the `RoutingConfig` passed to `setIntlConfig` — throws a descriptive
 * error otherwise.
 *
 * The privacy-policy-update banner turns on automatically, and only when
 * `cookieConsent.privacyPolicyDate` is configured: once a visitor has
 * consented, if their stored consent date predates `privacyPolicyDate`,
 * `privacyPolicyUpdated` becomes `true` until they call
 * `acknowledgePrivacyPolicyUpdate()`.
 *
 * @param requiresConsent Resolved server-side from
 *   `cookieConsent.getCountryCode`/`gdprCountries` — `false` means the
 *   visitor's country doesn't require the banner at all, so a first-time
 *   visitor (no stored cookie) gets `consent` seeded to `true` instead of
 *   `null`, skipping the dialog and unlocking analytics immediately.
 *   Defaults to `true` (always show the banner) when omitted, e.g. when
 *   `cookieConsent.getCountryCode` isn't configured.
 *
 * @example
 * ```tsx
 * <CookieConsentProvider>
 *   {children}
 *   <CookieConsentDialog />
 *   <PrivacyPolicyUpdateDialog />
 * </CookieConsentProvider>
 * ```
 */
export default function CookieConsentProvider({ requiresConsent, children }: {
    requiresConsent?: boolean;
    children: React.ReactNode;
}): React.ReactElement;

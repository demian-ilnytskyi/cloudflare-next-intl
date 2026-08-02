import type { CookieConsentAnalyticsSecrets } from '../../../types/types';
/**
 * Renders whichever analytics/ads scripts have a resolved secret, gated on
 * consent: Google Consent Mode bootstrap always loads (defaults to
 * `denied`, only sends `update` once `consent` is decided); Cloudflare Web
 * Analytics beacon and Microsoft Clarity only load once `consent === true`.
 * Rendered automatically by `IntlProvider` when `cookieConsent.secrets`/
 * `getSecrets` resolves at least one field and `autoWireAnalytics` isn't
 * `false` — render manually instead if you set `autoWireAnalytics: false`.
 */
export default function CookieConsentAnalytics({ secrets }: {
    secrets: CookieConsentAnalyticsSecrets;
}): React.ReactElement | null;
/**
 * Denies storage by default and loads the configured Google tags; the
 * effect above sends the `update` once consent is known. Only IDs present
 * in `secrets` are included.
 */
export declare function googleConsentModeBootstrapScript(secrets: CookieConsentAnalyticsSecrets): string;

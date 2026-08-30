import type { AutoAnalyticsEventsConfig } from '../../../types/types.js';
/**
 * Auto-rendered alongside `CookieConsentAnalytics` when Google Analytics/Ads
 * is configured — sends `screen_view` on route change and one
 * `gtag('event', ...)` per Web Vitals metric. Gated on consent the same way
 * as the other analytics scripts (no-ops until `gtag` exists on `window`).
 * See `CookieConsentRoutingConfig.autoAnalyticsEvents` to disable specific
 * events or customize `screen_name`.
 */
export default function AutoAnalyticsEvents({ config }: {
    config?: AutoAnalyticsEventsConfig;
}): React.ReactElement | null;

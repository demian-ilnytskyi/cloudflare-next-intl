'use client';

import { useEffect, useSyncExternalStore, Suspense } from 'react';
import dynamic from 'next/dynamic.js';
import useCookieConsent from '../use_cookie_consent.js';
import type { CookieConsentAnalyticsConfig } from '../../../types/types.js';

// Hoisted to module scope — calling `dynamic()` inside the component body
// creates a brand-new component identity every render, forcing a
// remount. Splitting into a separate chunk keeps `@microsoft/clarity`'s
// import out of this module until `ClarityScript` is actually rendered.
const ClarityScript = dynamic(() => import('./clarity_script.js'));

/**
 * Renders whichever analytics/ads scripts have a resolved secret, gated on
 * consent: Google Consent Mode bootstrap always loads (defaults to
 * `denied`, only sends `update` once `consent` is decided); Cloudflare Web
 * Analytics beacon and Microsoft Clarity only load once `consent === true`.
 * Rendered automatically by `IntlProvider` when `cookieConsent.analytics`/
 * `getAnalytics` resolves at least one field and `autoWireAnalytics` isn't
 * `false` — render manually instead if you set `autoWireAnalytics: false`.
 */
const noopSubscribe = () => () => undefined;

export default function CookieConsentAnalytics({ config }: { config: CookieConsentAnalyticsConfig }): React.ReactElement | null {
    const { consent, requiresConsent } = useCookieConsent();
    const granted = consent === true || !requiresConsent;
    const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

    useEffect(() => {
        if (consent === null && requiresConsent) return;
        const w = window as unknown as { gtag?: (...args: unknown[]) => void };
        if (typeof w.gtag !== 'function') return;
        const state = granted ? 'granted' : 'denied';
        w.gtag('consent', 'update', {
            ad_storage: state,
            ad_user_data: state,
            ad_personalization: state,
            analytics_storage: state,
        });
    }, [consent, requiresConsent, granted]);

    useEffect(() => {
        if (!granted || !config.cloudflareBeaconToken) return;
        if (document.querySelector('script[data-cf-beacon]')) return;
        const script = document.createElement('script');
        script.defer = true;
        script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        script.setAttribute('data-cf-beacon', config.cloudflareBeaconToken);
        document.head.appendChild(script);
    }, [granted, config.cloudflareBeaconToken]);

    const hasGoogle = Boolean(config.googleAnalyticsId || config.googleAdsId || config.googleAdSenseId);

    return (
        <>
            {hasGoogle && (
                <script
                    id="cookie-consent-google-consent-mode"
                    dangerouslySetInnerHTML={{ __html: googleConsentModeBootstrapScript(config) }} />
            )}
            {hydrated && granted && config.clarityProjectId && (
                <Suspense fallback={null}>
                    <ClarityScript projectId={config.clarityProjectId} />
                </Suspense>
            )}
        </>
    );
}

/**
 * Denies storage by default and loads the configured Google tags; the
 * effect above sends the `update` once consent is known. Only IDs present
 * in `config` are included.
 */
export function googleConsentModeBootstrapScript(config: CookieConsentAnalyticsConfig): string {
    const configCalls = [config.googleAnalyticsId, config.googleAdsId]
        .filter(Boolean)
        .map((id) => `gtag('config', '${id}');`)
        .join('\n');

    const gtagLoader = config.googleAnalyticsId || config.googleAdsId
        ? `(function(){
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=${config.googleAnalyticsId ?? config.googleAdsId}';
  document.head.appendChild(s);
})();`
        : '';

    const adSenseLoader = config.googleAdSenseId
        ? `(function(){
  var a = document.createElement('script');
  a.async = true;
  a.crossOrigin = 'anonymous';
  a.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.googleAdSenseId}';
  document.head.appendChild(a);
})();`
        : '';

    return `try {
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500
});
gtag('js', new Date());
${configCalls}
${gtagLoader}
${adSenseLoader}
} catch (e) { try { console.error('Cookie Consent Analytics Script Error:', e); } catch (e2) {} }`;
}

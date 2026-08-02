'use client';

import { useEffect } from 'react';
import useCookieConsent from '../use_cookie_consent';
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
export default function CookieConsentAnalytics({ secrets }: { secrets: CookieConsentAnalyticsSecrets }): React.ReactElement | null {
    const { consent } = useCookieConsent();

    useEffect(() => {
        if (consent === null) return;
        const w = window as unknown as { gtag?: (...args: unknown[]) => void };
        if (typeof w.gtag !== 'function') return;
        const state = consent ? 'granted' : 'denied';
        w.gtag('consent', 'update', {
            ad_storage: state,
            ad_user_data: state,
            ad_personalization: state,
            analytics_storage: state,
        });
    }, [consent]);

    const hasGoogle = Boolean(secrets.googleAnalyticsId || secrets.googleAdsId || secrets.googleAdSenseId);

    return (
        <>
            {hasGoogle && (
                <script
                    id="cookie-consent-google-consent-mode"
                    dangerouslySetInnerHTML={{ __html: googleConsentModeBootstrapScript(secrets) }} />
            )}
            {consent === true && secrets.cloudflareBeaconToken && (
                <script
                    defer
                    src="https://static.cloudflareinsights.com/beacon.min.js"
                    data-cf-beacon={secrets.cloudflareBeaconToken} />
            )}
            {consent === true && secrets.clarityProjectId && <ClarityScript projectId={secrets.clarityProjectId} />}
        </>
    );
}

function ClarityScript({ projectId }: { projectId: string }): null {
    useEffect(() => {
        import('@microsoft/clarity')
            .then(({ default: Clarity }) => {
                Clarity.init(projectId);
                Clarity.consent();
            })
            .catch((error) => console.error(`cloudflare-next-intl: failed to load @microsoft/clarity: ${error}`));
    }, [projectId]);
    return null;
}

/**
 * Denies storage by default and loads the configured Google tags; the
 * effect above sends the `update` once consent is known. Only IDs present
 * in `secrets` are included.
 */
export function googleConsentModeBootstrapScript(secrets: CookieConsentAnalyticsSecrets): string {
    const configCalls = [secrets.googleAnalyticsId, secrets.googleAdsId]
        .filter(Boolean)
        .map((id) => `gtag('config', '${id}');`)
        .join('\n');

    const gtagLoader = secrets.googleAnalyticsId || secrets.googleAdsId
        ? `(function(){
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=${secrets.googleAnalyticsId ?? secrets.googleAdsId}';
  document.head.appendChild(s);
})();`
        : '';

    const adSenseLoader = secrets.googleAdSenseId
        ? `(function(){
  var a = document.createElement('script');
  a.async = true;
  a.crossOrigin = 'anonymous';
  a.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${secrets.googleAdSenseId}';
  document.head.appendChild(a);
})();`
        : '';

    return `window.dataLayer = window.dataLayer || [];
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
${adSenseLoader}`;
}

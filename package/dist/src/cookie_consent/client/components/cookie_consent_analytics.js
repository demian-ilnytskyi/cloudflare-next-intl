'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import useCookieConsent from '../use_cookie_consent.js';
const ClarityScript = dynamic(() => import('./clarity_script.js'));
export default function CookieConsentAnalytics({ config }) {
    const { consent, requiresConsent } = useCookieConsent();
    const granted = consent === true || !requiresConsent;
    useEffect(() => {
        if (consent === null && requiresConsent)
            return;
        const w = window;
        if (typeof w.gtag !== 'function')
            return;
        const state = granted ? 'granted' : 'denied';
        w.gtag('consent', 'update', {
            ad_storage: state,
            ad_user_data: state,
            ad_personalization: state,
            analytics_storage: state,
        });
    }, [consent, requiresConsent, granted]);
    const hasGoogle = Boolean(config.googleAnalyticsId || config.googleAdsId || config.googleAdSenseId);
    return (_jsxs(_Fragment, { children: [hasGoogle && (_jsx("script", { id: "cookie-consent-google-consent-mode", dangerouslySetInnerHTML: { __html: googleConsentModeBootstrapScript(config) } })), granted && config.cloudflareBeaconToken && (_jsx("script", { defer: true, src: "https://static.cloudflareinsights.com/beacon.min.js", "data-cf-beacon": config.cloudflareBeaconToken })), granted && config.clarityProjectId && _jsx(ClarityScript, { projectId: config.clarityProjectId })] }));
}
export function googleConsentModeBootstrapScript(config) {
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

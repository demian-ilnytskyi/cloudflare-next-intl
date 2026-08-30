'use client';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';
import useCookieConsent from '../use_cookie_consent.js';
const metricEventNames = {
    CLS: 'web_cls',
    FCP: 'web_fcp',
    FID: 'web_fid',
    LCP: 'web_lcp',
    TTFB: 'web_ttfb',
    INP: 'web_inp',
};
const formatMetricValue = (name, value) => Math.round(name === 'CLS' ? value * 1000 : value);
function gtagEvent(name, params) {
    const w = window;
    if (typeof w.gtag !== 'function')
        return;
    w.gtag('event', name, params);
}
/**
 * Auto-rendered alongside `CookieConsentAnalytics` when Google Analytics/Ads
 * is configured — sends `screen_view` on route change and one
 * `gtag('event', ...)` per Web Vitals metric. Gated on consent the same way
 * as the other analytics scripts (no-ops until `gtag` exists on `window`).
 * See `CookieConsentRoutingConfig.autoAnalyticsEvents` to disable specific
 * events or customize `screen_name`.
 */
export default function AutoAnalyticsEvents({ config }) {
    const { consent, requiresConsent } = useCookieConsent();
    const granted = consent === true || !requiresConsent;
    const path = usePathname();
    const screenName = config?.getScreenName ? config.getScreenName(path) : path;
    const enabledEvents = config?.events;
    const isEnabled = (event) => !enabledEvents || enabledEvents.includes(event);
    useEffect(() => {
        if (!granted)
            return;
        if (!isEnabled('screen_view'))
            return;
        gtagEvent('screen_view', { screen_name: screenName, page_path: path });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, screenName, granted]);
    useReportWebVitals((metric) => {
        if (!granted)
            return;
        const eventName = metricEventNames[metric.name];
        if (!isEnabled(eventName))
            return;
        gtagEvent(eventName, {
            value: formatMetricValue(metric.name, metric.value),
            metric_rating: metric.rating,
            screen_name: screenName,
            page_path: path,
        });
    });
    return null;
}

import React from 'react';
import CoreHelperScript from 'cloudflare-next-intl-intl/internal/helperScript';
import ThemeScript from 'cloudflare-next-intl-theme/ThemeScript';
import StaleDeployScripts, { defaultReloadHtml } from 'cloudflare-next-intl-errors/staleDeployScripts';
import config from '../../config/intl_config.js';

export { defaultReloadHtml };

export default function HelperScript({ locale }: { locale?: string }): React.JSX.Element {
    const analytics = config.cookieConsent?.analytics;
    const hasGoogle = !!(analytics?.googleAnalyticsId || analytics?.googleAdsId || analytics?.googleAdSenseId);
    const hasClarity = !!analytics?.clarityProjectId;
    const hasFirebase = !!config.firebaseAuth;
    const hasTurnstile = !!config.firebaseAuth?.appCheck?.turnstileSiteKey;

    const prefetchOrigins: string[] = [];
    if (hasGoogle) prefetchOrigins.push('https://www.googletagmanager.com');
    if (hasClarity) {
        prefetchOrigins.push('https://www.clarity.ms');
        prefetchOrigins.push('https://scripts.clarity.ms');
    }
    if (hasFirebase) prefetchOrigins.push('https://firebaseinstallations.googleapis.com');

    const preconnectOrigins: string[] = [];
    if (hasTurnstile) preconnectOrigins.push('https://challenges.cloudflare.com');

    return (
        <CoreHelperScript
            locale={locale}
            prefetchOrigins={prefetchOrigins.length > 0 ? prefetchOrigins : undefined}
            preconnectOrigins={preconnectOrigins.length > 0 ? preconnectOrigins : undefined}
        >
            <ThemeScript />
            <StaleDeployScripts reloadHtml={config.errorHandling?.staleDeployReloadHtml} />
        </CoreHelperScript>
    );
}

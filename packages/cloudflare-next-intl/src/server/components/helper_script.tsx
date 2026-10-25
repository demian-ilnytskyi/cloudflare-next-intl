import React from 'react';
import CoreHelperScript from 'cloudflare-next-intl-intl/internal/helperScript';
import ThemeScript from 'cloudflare-next-intl-theme/ThemeScript';
import StaleDeployScripts, { defaultReloadHtml } from 'cloudflare-next-intl-errors/staleDeployScripts';
import config from '../../config/intl_config.js';

export { defaultReloadHtml };

export interface HelperScriptProps {
    locale?: string;
    googleTag?: boolean;
    googleTagId?: string | false;
    /**
     * Whether to preload and render the Cloudflare Turnstile script and container
     * in `<head>` when `firebaseAuth.appCheck.turnstileSiteKey` is configured.
     * Defaults to `true` (can also be configured via `firebaseAuth.appCheck.preloadTurnstile`).
     */
    turnstilePreload?: boolean;
}

export default function HelperScript({
    locale,
    googleTag,
    googleTagId,
    turnstilePreload,
}: HelperScriptProps = {}): React.JSX.Element {
    const analytics = config.cookieConsent?.analytics;
    const cookieConsent = config.cookieConsent;

    const isGoogleTagExplicitlyOff =
        googleTag === false ||
        googleTagId === false ||
        analytics?.googleTag === false ||
        analytics?.googleTagId === false ||
        cookieConsent?.googleTag === false ||
        cookieConsent?.googleTagId === false;

    const rawTagId =
        (typeof googleTagId === 'string' ? googleTagId : undefined) ||
        (typeof analytics?.googleTagId === 'string' ? analytics.googleTagId : undefined) ||
        (typeof cookieConsent?.googleTagId === 'string' ? cookieConsent.googleTagId : undefined) ||
        analytics?.googleAdsId;

    const resolvedGoogleTagId = !isGoogleTagExplicitlyOff ? rawTagId : undefined;
    const shouldRenderGoogleTag = Boolean(resolvedGoogleTagId && !isGoogleTagExplicitlyOff);

    const hasGoogle = !!(
        analytics?.googleAnalyticsId ||
        analytics?.googleAdsId ||
        analytics?.googleAdSenseId ||
        shouldRenderGoogleTag
    );
    const hasClarity = !!analytics?.clarityProjectId;
    const hasFirebase = !!config.firebaseAuth;
    const hasTurnstile = !!config.firebaseAuth?.appCheck?.turnstileSiteKey;
    const shouldPreloadTurnstile =
        hasTurnstile &&
        turnstilePreload !== false &&
        config.firebaseAuth?.appCheck?.preloadTurnstile !== false;

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
            {shouldPreloadTurnstile && (
                <script async src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" />
            )}
            {shouldRenderGoogleTag && (
                <>
                    <script async src={`https://www.googletagmanager.com/gtag/js?id=${resolvedGoogleTagId}`} />
                    <script
                        id="google-tag-init"
                        dangerouslySetInnerHTML={{
                            __html: `window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${resolvedGoogleTagId}');`,
                        }}
                    />
                </>
            )}
        </CoreHelperScript>
    );
}

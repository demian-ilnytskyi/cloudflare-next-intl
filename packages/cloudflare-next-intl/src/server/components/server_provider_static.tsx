import CoreIntlProviderStatic from 'cloudflare-next-intl-intl/serverProviderStatic';
import ClientExtensions from '../../client/components/client_extensions.js';
import config from '../../config/intl_config.js';
import type { TranslationObject } from '../../types/types.js';
import type { CookieConsentAnalyticsConfig } from '../../types/types.js';
import reportError from '../../error_handling/report_error.js';

export default async function LocationzationProvider({
    language,
    messages,
    children,
}: {
    language: string;
    messages?: TranslationObject;
    children: React.ReactNode;
}) {
    if (config.firebaseAuth) {
        throw new Error(
            '[cloudflare-next-intl] `firebaseAuth` is configured but this route uses ' +
            '`cloudflare-next-intl/serverProviderStatic`, which never renders the firebase-auth ' +
            'client provider (by design — that\'s what keeps output: "export" builds free of the ' +
            '"use server" clear_session_action). Use `cloudflare-next-intl/serverProvider` instead ' +
            'for apps that configure `firebaseAuth`.',
        );
    }

    let analyticsConfig: CookieConsentAnalyticsConfig | undefined;
    let requiresConsent = true;
    if (config.cookieConsent) {
        const isDevEnvironment = process.env.NODE_ENV === 'development';
        requiresConsent = !isDevEnvironment;

        const analyticsAllowedInEnv = config.cookieConsent.enableAnalyticsInDevMode === true || !isDevEnvironment;

        if (config.cookieConsent.autoWireAnalytics !== false && analyticsAllowedInEnv) {
            if (config.cookieConsent.getAnalytics) {
                try {
                    analyticsConfig = await config.cookieConsent.getAnalytics();
                } catch (error) {
                    await reportError(config, { error, classOrMethodName: 'getAnalytics' });
                }
            } else {
                analyticsConfig = config.cookieConsent.analytics;
            }
        }
    }

    return await CoreIntlProviderStatic({
        language,
        messages,
        children: (
            <ClientExtensions
                requiresConsent={requiresConsent}
                autoWireDialogs={config.cookieConsent?.autoWireDialogs !== false}
                dialogProps={config.cookieConsent?.dialogProps}
                updateDialogProps={config.cookieConsent?.updateDialogProps}
                analyticsConfig={analyticsConfig}
                autoAnalyticsEventsConfig={config.cookieConsent?.autoAnalyticsEvents}
            >
                {children}
            </ClientExtensions>
        ),
    });
}

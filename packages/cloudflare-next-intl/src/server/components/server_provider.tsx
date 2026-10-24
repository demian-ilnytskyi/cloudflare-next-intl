import React from 'react';
import CoreIntlProvider from 'cloudflare-next-intl-intl/serverProvider';
import { localesSet } from 'cloudflare-next-intl-intl/middleware';
import ClientExtensions from '../../client/components/client_extensions.js';
import config from '../../config/intl_config.js';
import type { TranslationObject } from '../../types/types.js';
import type { SerializedAuthUser } from '../../firebase_auth/types.js';
import type { CookieConsentAnalyticsConfig } from '../../types/types.js';
import reportError from '../../error_handling/report_error.js';
import installConsoleErrorOverride from '../../error_handling/install_console_error_override.js';
import type * as AuthUserServerProviderModule from '../../firebase_auth/server/auth_user_server_provider.js';

let authUserServerProviderModule: typeof AuthUserServerProviderModule | undefined;

export default async function LocationzationProvider({
    language,
    messages,
    staticSafe = true,
    children,
}: {
    language: string;
    messages?: TranslationObject;
    staticSafe?: boolean;
    children: React.ReactNode;
}): Promise<React.JSX.Element> {
    if (!localesSet.has(language)) {
        const { notFound } = await import('next/navigation.js');
        notFound();
    }

    let initialAuthUser: SerializedAuthUser | null = null;
    const autoWireClientProvider = config.firebaseAuth?.autoWireClientProvider !== false;
    if (config.firebaseAuth && autoWireClientProvider) {
        if (staticSafe && config.firebaseAuth.middlewareEnabled === false) {
            console.warn(
                '[cloudflare-next-intl] IntlProvider was called with `staticSafe: true` while ' +
                '`firebaseAuth.middlewareEnabled` is `false`. With middleware auth disabled, ' +
                'this component is the ONLY place performing the auth redirect — skipping it ' +
                'here removes that protection entirely, it does not just remove a render flash. ' +
                'Set `staticSafe: false` (or enable middleware auth) for this route.',
            );
        }

        if (!staticSafe) {
            if (!authUserServerProviderModule) {
                authUserServerProviderModule = await import('../../firebase_auth/server/auth_user_server_provider.js');
            }
            initialAuthUser = await authUserServerProviderModule.resolveAuthUserAndRedirect();
        }
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

    installConsoleErrorOverride(config);

    return await CoreIntlProvider({
        language,
        messages,
        children: (
            <ClientExtensions
                initialAuthUser={initialAuthUser}
                skipAuthProvider={!autoWireClientProvider}
                hasFirebaseAuth={Boolean(config.firebaseAuth)}
                enableFirebasePerformance={config.firebaseAuth?.performance !== false}
                hasCookieConsent={Boolean(config.cookieConsent)}
                cookieConsentConfig={config.cookieConsent}
                analyticsConfig={analyticsConfig}
                requiresConsent={requiresConsent}
                autoWireDialogs={config.cookieConsent?.autoWireDialogs !== false}
                dialogProps={config.cookieConsent?.dialogProps}
                updateDialogProps={config.cookieConsent?.updateDialogProps}
                autoAnalyticsEventsConfig={config.cookieConsent?.autoAnalyticsEvents}
            >
                {children}
            </ClientExtensions>
        ),
    });
}

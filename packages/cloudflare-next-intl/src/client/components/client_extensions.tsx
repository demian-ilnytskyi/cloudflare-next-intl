'use client';

import { useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic.js';
import CookieConsentProvider from '../../cookie_consent/client/cookie_consent_provider.js';
import AuthUserProvider from '../../firebase_auth/client/auth_user_provider.js';
import config from '../../config/intl_config.js';
import type { SerializedAuthUser } from '../../firebase_auth/types.js';
import type { CookieConsentAnalyticsConfig, AutoAnalyticsEventsConfig } from '../../types/types.js';
import type { CookieConsentDialogProps } from '../../cookie_consent/client/components/cookie_consent_dialog.js';
import type { PrivacyPolicyUpdateDialogProps } from '../../cookie_consent/client/components/privacy_policy_update_dialog.js';

const AutoFirebasePerformanceEvents = dynamic(
    () => import('../../firebase_auth/client/components/auto_firebase_performance_events.js'),
);
const CookieConsentAnalytics = dynamic(
    () => import('../../cookie_consent/client/components/cookie_consent_analytics.js'),
);
const AutoAnalyticsEvents = dynamic(
    () => import('../../cookie_consent/client/components/auto_analytics_events.js'),
);
const loadCookieConsentDialog = () =>
    import('../../cookie_consent/client/components/cookie_consent_dialog.js');
const CookieConsentDialog = dynamic(loadCookieConsentDialog);
const PrivacyPolicyUpdateDialog = dynamic(
    () => import('../../cookie_consent/client/components/privacy_policy_update_dialog.js'),
);

export interface ClientExtensionsProps {
    initialAuthUser?: SerializedAuthUser | null;
    skipAuthProvider?: boolean;
    requiresConsent?: boolean;
    autoWireDialogs?: boolean;
    dialogProps?: CookieConsentDialogProps;
    updateDialogProps?: PrivacyPolicyUpdateDialogProps;
    analyticsConfig?: CookieConsentAnalyticsConfig;
    autoAnalyticsEventsConfig?: AutoAnalyticsEventsConfig;
    children: React.ReactNode;
}

export default function ClientExtensions({
    initialAuthUser = null,
    skipAuthProvider = false,
    requiresConsent = true,
    autoWireDialogs = true,
    dialogProps,
    updateDialogProps,
    analyticsConfig,
    autoAnalyticsEventsConfig,
    children,
}: ClientExtensionsProps) {
    useEffect(() => {
        if (!config.cookieConsent || !autoWireDialogs) return;
        loadCookieConsentDialog().catch(() => undefined);
    }, [autoWireDialogs]);

    let providedChildren = children;
    if (config.firebaseAuth && !skipAuthProvider) {
        providedChildren = (
            <AuthUserProvider initialUser={initialAuthUser}>
                {children}
                {config.firebaseAuth.performance !== false && (
                    <Suspense fallback={null}>
                        <AutoFirebasePerformanceEvents />
                    </Suspense>
                )}
            </AuthUserProvider>
        );
    }

    if (config.cookieConsent) {
        providedChildren = (
            <CookieConsentProvider requiresConsent={requiresConsent}>
                {providedChildren}
                {analyticsConfig && (
                    <Suspense fallback={null}>
                        <CookieConsentAnalytics config={analyticsConfig} />
                    </Suspense>
                )}
                {autoAnalyticsEventsConfig && (
                    <Suspense fallback={null}>
                        <AutoAnalyticsEvents config={autoAnalyticsEventsConfig} />
                    </Suspense>
                )}
                {autoWireDialogs && (
                    <>
                        <Suspense fallback={null}>
                            <CookieConsentDialog {...dialogProps} />
                        </Suspense>
                        <Suspense fallback={null}>
                            <PrivacyPolicyUpdateDialog {...updateDialogProps} />
                        </Suspense>
                    </>
                )}
            </CookieConsentProvider>
        );
    }

    return <>{providedChildren}</>;
}

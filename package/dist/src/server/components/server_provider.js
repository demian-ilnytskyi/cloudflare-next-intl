import { jsx as _jsx } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { getMessage } from "../functions/server.js";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware.js";
import config from "../../config/intl_config.js";
import resolveRequiresConsent from "../../cookie_consent/gdpr_countries.js";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import reportError from "../../error_handling/report_error.js";
const LocationzationClientProvider = dynamic(() => import("../../client/components/client_provider.js"));
let authUserServerProviderModule;
export default async function LocationzationProvider({ language, messages, staticSafe = true, children }) {
    if (!localesSet.has(language)) {
        const { notFound } = await import("next/navigation");
        notFound();
    }
    if (language) {
        setLocaleCache(language);
    }
    if (messages) {
        setMessageForLocaleCache(language, messages);
    }
    const messagesValue = messages ?? await getMessage(language);
    installConsoleErrorOverride(config);
    let initialAuthUser = null;
    const autoWireClientProvider = config.firebaseAuth?.autoWireClientProvider !== false;
    if (config.firebaseAuth && autoWireClientProvider) {
        if (staticSafe && config.firebaseAuth.middlewareEnabled === false) {
            console.warn('[cloudflare-next-intl] IntlProvider was called with `staticSafe: true` while ' +
                '`firebaseAuth.middlewareEnabled` is `false`. With middleware auth disabled, ' +
                'this component is the ONLY place performing the auth redirect — skipping it ' +
                'here removes that protection entirely, it does not just remove a render flash. ' +
                'Set `staticSafe: false` (or enable middleware auth) for this route.');
        }
        if (!staticSafe) {
            if (!authUserServerProviderModule) {
                authUserServerProviderModule = await import("../../firebase_auth/server/auth_user_server_provider.js");
            }
            initialAuthUser = await authUserServerProviderModule.resolveAuthUserAndRedirect();
        }
    }
    let analyticsConfig;
    let requiresConsent = true;
    if (config.cookieConsent) {
        const isDevEnvironment = process.env.NODE_ENV === 'development';
        requiresConsent = !isDevEnvironment
            ? await resolveRequiresConsent(config.cookieConsent.getCountryCode, config.generate?.getCloudflareContext, config.cookieConsent.gdprCountries, config.errorHandling, config.cookieConsent.countryHeaderNames, config.generate)
            : false;
        const analyticsAllowedInEnv = config.cookieConsent.enableAnalyticsInDevMode === true || !isDevEnvironment;
        if (config.cookieConsent.autoWireAnalytics !== false && analyticsAllowedInEnv) {
            if (config.cookieConsent.getAnalytics) {
                try {
                    analyticsConfig = await config.cookieConsent.getAnalytics();
                }
                catch (error) {
                    await reportError(config, { error, classOrMethodName: 'getAnalytics' });
                }
            }
            else {
                analyticsConfig = config.cookieConsent.analytics;
            }
        }
    }
    return _jsx(LocationzationClientProvider, { language: language, messages: messagesValue, initialAuthUser: initialAuthUser, skipAuthProvider: !autoWireClientProvider, analyticsConfig: analyticsConfig, autoAnalyticsEventsConfig: config.cookieConsent?.autoAnalyticsEvents, requiresConsent: requiresConsent, autoWireDialogs: config.cookieConsent?.autoWireDialogs !== false, dialogProps: config.cookieConsent?.dialogProps, updateDialogProps: config.cookieConsent?.updateDialogProps, children: children });
}

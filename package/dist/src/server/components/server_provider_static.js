import { jsx as _jsx } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { getMessage } from "../functions/server.js";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware.js";
import config from "../../config/intl_config.js";
import resolveRequiresConsent from "../../cookie_consent/gdpr_countries.js";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import reportError from "../../error_handling/report_error.js";
const LocationzationClientProvider = dynamic(() => import("../../client/components/client_provider_static.js"));
export default async function LocationzationProvider({ language, messages, children }) {
    if (!localesSet.has(language)) {
        const { notFound } = await import("next/navigation");
        notFound();
    }
    if (config.firebaseAuth) {
        throw new Error('[cloudflare-next-intl] `firebaseAuth` is configured but this route uses ' +
            '`cloudflare-next-intl/serverProviderStatic`, which never renders the firebase-auth ' +
            'client provider (by design — that\'s what keeps output: "export" builds free of the ' +
            '"use server" clear_session_action). Use `cloudflare-next-intl/serverProvider` instead ' +
            'for apps that configure `firebaseAuth`.');
    }
    if (language) {
        setLocaleCache(language);
    }
    if (messages) {
        setMessageForLocaleCache(language, messages);
    }
    const messagesValue = messages ?? await getMessage(language);
    installConsoleErrorOverride(config);
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
    return _jsx(LocationzationClientProvider, { language: language, messages: messagesValue, analyticsConfig: analyticsConfig, autoAnalyticsEventsConfig: config.cookieConsent?.autoAnalyticsEvents, requiresConsent: requiresConsent, autoWireDialogs: config.cookieConsent?.autoWireDialogs !== false, dialogProps: config.cookieConsent?.dialogProps, updateDialogProps: config.cookieConsent?.updateDialogProps, children: children });
}

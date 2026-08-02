import { jsx as _jsx } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { getMessage } from "../functions/server";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware";
import config from "../../config/intl_config";
import resolveRequiresConsent from "../../cookie_consent/gdpr_countries";
const LocationzationClientProvider = dynamic(() => import("../../client/components/client_provider"));
let authUserServerProviderModule;
/**
 * Server component that provides locale/messages context to the rest of the
 * tree. Exported publicly as `IntlProvider` from `cloudflare-next-intl/serverProvider`.
 *
 * Wrap this around your app once, near the root layout, below `[locale]`.
 * It seeds the server-side locale/message caches (for `getLocale`/`getTranslations`)
 * and also passes them to the client `LocaleContext` (for `useLocale`/`useTranslations`
 * in client components).
 *
 * @param language The current route's locale (typically the `[locale]` route
 *   param). Must be one of your configured `locales` — calls `notFound()`
 *   otherwise.
 * @param messages Optional pre-loaded messages for `language`. If omitted,
 *   they're loaded via `getMessage(language)`.
 *
 * @example
 * ```tsx
 * export default async function RootLayout({ children, params }) {
 *   const { locale } = await params;
 *   return (
 *     <html lang={locale}>
 *       <body>
 *         <IntlProvider language={locale}>{children}</IntlProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export default async function LocationzationProvider({ language, messages, children }) {
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
    let initialAuthUser = null;
    const autoWireClientProvider = config.firebaseAuth?.autoWireClientProvider !== false;
    if (config.firebaseAuth && autoWireClientProvider) {
        if (!authUserServerProviderModule) {
            authUserServerProviderModule = await import("../../firebase_auth/server/auth_user_server_provider");
        }
        initialAuthUser = await authUserServerProviderModule.resolveAuthUserAndRedirect();
    }
    let analyticsSecrets;
    let requiresConsent = true;
    if (config.cookieConsent) {
        const isDevEnvironment = process.env.NODE_ENV === 'development';
        // `getCloudflareContext` under `next dev`'s Cloudflare dev shim can
        // crash the local workerd process (a native RPC panic, not a
        // catchable JS error — see cloudflare/workers-sdk#8687) merely by
        // being called, regardless of what it resolves to. `getCountryCode`
        // is caller-supplied and may be dev-safe, so only skip the
        // `getCloudflareContext` path in dev; fail-safe to `true`
        // (banner shown) same as an unresolved country would.
        requiresConsent = !isDevEnvironment
            ? await resolveRequiresConsent(config.cookieConsent.getCountryCode, config.cookieConsent.getCloudflareContext, config.cookieConsent.gdprCountries)
            : true;
        const analyticsAllowedInEnv = config.cookieConsent.enableAnalyticsInDevMode === true || !isDevEnvironment;
        if (config.cookieConsent.autoWireAnalytics !== false && analyticsAllowedInEnv) {
            analyticsSecrets = config.cookieConsent.getSecrets
                ? await config.cookieConsent.getSecrets()
                : config.cookieConsent.secrets;
        }
    }
    return _jsx(LocationzationClientProvider, { language: language, messages: messagesValue, initialAuthUser: initialAuthUser, skipAuthProvider: !autoWireClientProvider, analyticsSecrets: analyticsSecrets, requiresConsent: requiresConsent, children: children });
}

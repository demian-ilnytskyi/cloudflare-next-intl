import { jsx as _jsx } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { getMessage } from "../functions/server";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware";
import config from "../../config/intl_config";
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
    return _jsx(LocationzationClientProvider, { language: language, messages: messagesValue, initialAuthUser: initialAuthUser, skipAuthProvider: !autoWireClientProvider, children: children });
}

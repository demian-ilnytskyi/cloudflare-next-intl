import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { getMessage } from "../functions/server";
import type { TranslationObject } from "../../types/types";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware";
import config from "../../config/intl_config";
import type { CookieConsentAnalyticsConfig } from "../../types/types";
import resolveRequiresConsent from "../../cookie_consent/gdpr_countries";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override";
import reportError from "../../error_handling/report_error";

const LocationzationClientProvider = dynamic(
    () => import("../../client/components/client_provider_static"),
);

/**
 * `output: 'export'`-safe variant of `IntlProvider`, exported publicly as
 * `cloudflare-next-intl/serverProviderStatic`. Identical to the regular
 * `IntlProvider` (`cloudflare-next-intl/serverProvider`) except it renders
 * `client_provider_static` instead of `client_provider` — a client provider
 * with zero import of `firebase_auth/client/auth_user_provider`, and
 * therefore zero reachability to the "use server" `clear_session_action`
 * file that module pulls in.
 *
 * Next's server-actions build step registers a "use server" file the
 * moment any `import()` in the compiled module graph points to it, even one
 * guarded by a runtime `if` — the guard doesn't remove the import
 * *statement*, only skips executing it. `output: 'export'` builds fail
 * outright the instant any server action is registered anywhere in the app,
 * so a config flag on the regular `IntlProvider` can't fix this: only a
 * provider tree with the import textually absent can. Use this variant on
 * any app built with `output: 'export'` that does not configure
 * `firebaseAuth` — it does not support `firebaseAuth` at all (that config
 * key must be omitted; `AuthUserProvider` is never rendered here regardless
 * of the config value). Regular server-rendered/Cloudflare-Workers apps
 * should keep using `cloudflare-next-intl/serverProvider`.
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
export default async function LocationzationProvider({ language, messages, children }: { language: string, messages?: TranslationObject, children: React.ReactNode }): Promise<Component> {
    if (!localesSet.has(language)) {
        const { notFound } = await import("next/navigation");
        notFound();
    }

    if (config.firebaseAuth) {
        throw new Error(
            '[cloudflare-next-intl] `firebaseAuth` is configured but this route uses ' +
            '`cloudflare-next-intl/serverProviderStatic`, which never renders the firebase-auth ' +
            'client provider (by design — that\'s what keeps output: "export" builds free of the ' +
            '"use server" clear_session_action). Use `cloudflare-next-intl/serverProvider` instead ' +
            'for apps that configure `firebaseAuth`.',
        );
    }

    if (language) {
        setLocaleCache(language);
    }
    if (messages) {
        setMessageForLocaleCache(language, messages);
    }
    const messagesValue = messages ?? await getMessage(language);

    installConsoleErrorOverride(config);

    let analyticsConfig: CookieConsentAnalyticsConfig | undefined;
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
            ? await resolveRequiresConsent(
                config.cookieConsent.getCountryCode,
                config.generate?.getCloudflareContext,
                config.cookieConsent.gdprCountries,
                config.errorHandling,
            )
            : false;

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

    return <LocationzationClientProvider
        language={language}
        messages={messagesValue}
        analyticsConfig={analyticsConfig}
        autoAnalyticsEventsConfig={config.cookieConsent?.autoAnalyticsEvents}
        requiresConsent={requiresConsent}
        autoWireDialogs={config.cookieConsent?.autoWireDialogs !== false}
        dialogProps={config.cookieConsent?.dialogProps}
        updateDialogProps={config.cookieConsent?.updateDialogProps}>
        {children}
    </LocationzationClientProvider>
}

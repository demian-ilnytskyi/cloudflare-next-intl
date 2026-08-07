import { jsx as _jsx } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { getMessage } from "../functions/server";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware";
import config from "../../config/intl_config";
import resolveRequiresConsent from "../../cookie_consent/gdpr_countries";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override";
import reportError from "../../error_handling/report_error";
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
 * @param staticSafe Marks THIS RENDER of `IntlProvider` as one that's safe
 *   to serve from static rendering / ISR — i.e. the caller already knows
 *   the current route never needs a server-resolved auth user (a public
 *   page: marketing, privacy policy, docs, etc). Concretely, setting this
 *   to `true` (the default) skips the internal `resolveAuthUserAndRedirect()`
 *   call. Pass `staticSafe: false` to opt back into resolving it.
 *
 *   ── Why this call exists, and why skipping it by default is safe ──
 *   When `firebaseAuth` is configured and `staticSafe: false` is passed,
 *   `IntlProvider` calls `resolveAuthUserAndRedirect()`, which:
 *     1. Reads the session cookie via `cookies()` and verifies it against
 *        Firebase (server-side, authoritative check for "who is this?").
 *     2. Reads the current pathname via `headers()` (`x-pathname`, set by
 *        `intlMiddleware`) to redirect guest → `redirectAuthPath` or
 *        signed-in → `homePath` on an auth page.
 *     3. Returns the resolved user so the client `AuthUserProvider` can
 *        render the correct signed-in/signed-out UI on the FIRST paint,
 *        with zero flash.
 *   Both `cookies()` and `headers()` are request-scoped APIs — calling
 *   either one forces Next.js to render the ENTIRE subtree dynamically on
 *   every request. No static HTML, no ISR, no caching — for that route
 *   AND every route nested under this same `IntlProvider` call, whether
 *   or not that specific route actually needs auth. A page in
 *   `firebaseAuth.whiteListPaths` (meant to be public) is NOT exempt from
 *   this cost today: the whitelist check happens only AFTER `cookies()`/
 *   `headers()` are already read, so it's just as dynamic as a protected
 *   page.
 *
 *   The redirect part of step 2 is redundant on any project using the
 *   default middleware wiring (`firebaseAuth.middlewareEnabled !== false`,
 *   the default): `intlMiddleware`'s `update_session` step already
 *   validates the session JWT (refreshing it via Firebase's token API if
 *   expired) and performs the exact same guest/auth-page redirects —
 *   authoritatively, on every request, BEFORE this component ever runs.
 *   So `staticSafe: true` does not weaken auth enforcement — the
 *   middleware gate still applies unchanged. The only thing you give up
 *   is step 3: `initialAuthUser` is not seeded server-side, so the client
 *   `AuthUserProvider` resolves it itself after mount instead. In
 *   practice this means a signed-in user MAY see this route's
 *   logged-out-state UI (e.g. a nav avatar placeholder) for one client
 *   render before the real user data appears — never wrong/protected
 *   content, since middleware already gated that; just a delayed value.
 *
 *   ── When to opt out (staticSafe: false) ──
 *   Pass `staticSafe: false` on `IntlProvider` calls that wrap protected
 *   routes or routes where the auth-state flash would be visually jarring
 *   (dashboards, account pages, anything showing `initialAuthUser`-derived
 *   content immediately). Leave the default (`true`) for routes you know
 *   are always public and don't render auth-dependent UI above the fold
 *   (or can tolerate that UI appearing a moment late). If you need
 *   different behavior for public vs protected routes within the SAME
 *   app, render `IntlProvider` twice — once per layout/route-group, each
 *   with its own `staticSafe` value — rather than picking one value for
 *   the whole app. If `firebaseAuth.middlewareEnabled` is explicitly
 *   `false` (middleware auth disabled), always pass `staticSafe: false` —
 *   this component becomes the ONLY place performing the auth redirect,
 *   so leaving the `true` default there really does remove the security
 *   check, not just the flash.
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
        // `staticSafe: true` with middleware auth disabled would silently
        // drop the ONLY auth redirect this app has — not just the flash-
        // prevention seed. Warn loudly rather than let that combination
        // slip through unnoticed; still honor the caller's choice, since a
        // hard throw here would be a worse failure mode than a console
        // warning for what is, after all, a caller-controlled flag.
        if (staticSafe && config.firebaseAuth.middlewareEnabled === false) {
            console.warn('[cloudflare-next-intl] IntlProvider was called with `staticSafe: true` while ' +
                '`firebaseAuth.middlewareEnabled` is `false`. With middleware auth disabled, ' +
                'this component is the ONLY place performing the auth redirect — skipping it ' +
                'here removes that protection entirely, it does not just remove a render flash. ' +
                'Set `staticSafe: false` (or enable middleware auth) for this route.');
        }
        if (!staticSafe) {
            if (!authUserServerProviderModule) {
                authUserServerProviderModule = await import("../../firebase_auth/server/auth_user_server_provider");
            }
            initialAuthUser = await authUserServerProviderModule.resolveAuthUserAndRedirect();
        }
    }
    let analyticsConfig;
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
            ? await resolveRequiresConsent(config.cookieConsent.getCountryCode, config.generate?.getCloudflareContext, config.cookieConsent.gdprCountries, config.errorHandling)
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
    return _jsx(LocationzationClientProvider, { language: language, messages: messagesValue, initialAuthUser: initialAuthUser, skipAuthProvider: !autoWireClientProvider, analyticsConfig: analyticsConfig, requiresConsent: requiresConsent, autoWireDialogs: config.cookieConsent?.autoWireDialogs !== false, dialogProps: config.cookieConsent?.dialogProps, updateDialogProps: config.cookieConsent?.updateDialogProps, children: children });
}

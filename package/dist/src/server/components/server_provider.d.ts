import type { TranslationObject } from "../../types/types";
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
 *   to `true` skips the internal `resolveAuthUserAndRedirect()` call.
 *
 *   ── Why this call is normally made, and why skipping it is safe ──
 *   When `firebaseAuth` is configured, `IntlProvider` by default calls
 *   `resolveAuthUserAndRedirect()`, which:
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
 *   ── When to use it ──
 *   Set `staticSafe: true` only on `IntlProvider` calls that wrap routes
 *   you know are always public and don't render auth-dependent UI above
 *   the fold (or can tolerate that UI appearing a moment late). Leave the
 *   default (`false`) for any `IntlProvider` call that also wraps
 *   protected routes or routes where the auth-state flash would be
 *   visually jarring (dashboards, account pages, anything showing
 *   `initialAuthUser`-derived content immediately). If you need
 *   different behavior for public vs protected routes within the SAME
 *   app, render `IntlProvider` twice — once per layout/route-group, each
 *   with its own `staticSafe` value — rather than picking one value for
 *   the whole app. If `firebaseAuth.middlewareEnabled` is explicitly
 *   `false` (middleware auth disabled), do NOT set `staticSafe: true` —
 *   this component becomes the ONLY place performing the auth redirect,
 *   so skipping it there really does remove the security check, not just
 *   the flash.
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
export default function LocationzationProvider({ language, messages, staticSafe, children }: {
    language: string;
    messages?: TranslationObject;
    staticSafe?: boolean;
    children: React.ReactNode;
}): Promise<Component>;

import type { NextResponse } from 'next/server';
import type { Languages } from 'next/dist/lib/metadata/types/alternative-urls-types';
import type { Videos } from 'next/dist/lib/metadata/types/metadata-types';
/**
 * Custom middleware hook, run by `intlMiddleware` for your own logic
 * (e.g. auth, feature flags, A/B tests) — on top of the library's own
 * locale routing (locale-prefix rewrite/redirect).
 *
 * STRICT RULE — at most ONE of `rewriteUrl` / `redirectUrl` is ever set, and
 * whichever is set tells you exactly what to do:
 * - `rewriteUrl` set: apply `NextResponse.rewrite(rewriteUrl, { request })`
 *   (locale matches the default locale — URL bar stays unchanged).
 * - `redirectUrl` set: apply `NextResponse.redirect(redirectUrl, request)`
 *   (locale differs from the URL — visible redirect). The handler only runs
 *   for this case when `runHandlerOnRedirect: true` is passed.
 * - BOTH undefined: no locale routing needed (URL already has the right
 *   locale prefix). This is where your own logic belongs — return
 *   `NextResponse.next({ request })`, or your own redirect (e.g. auth).
 *
 * Returning `null` in any case makes the library apply its own default,
 * which is the same rewrite/redirect/`next()` described above.
 *
 * @param locale      The resolved locale for this request (e.g. `"en"`).
 * @param rewriteUrl  URL to rewrite to, or `undefined`.
 * @param redirectUrl URL to redirect to, or `undefined`.
 * @returns           A `NextResponse` to use for this request, or `null` to
 *                    let the library build the default one.
 *
 * @example
 * ```ts
 * middlewareHandler: (locale, rewriteUrl, redirectUrl) => {
 *   if (rewriteUrl) return NextResponse.rewrite(rewriteUrl, { request });
 *   if (redirectUrl) return NextResponse.redirect(redirectUrl, request);
 *   // No locale routing needed — your own logic goes here.
 *   return NextResponse.next({ request });
 * }
 * ```
 */
export type MiddlewareCustomHandler = (locale: string, rewriteUrl: URL | undefined, redirectUrl: URL | undefined) => NextResponse<unknown> | null | Promise<NextResponse<unknown> | null>;
/** Your app's list of supported locale codes, e.g. `["en", "de"] as const`. */
export type Locales = readonly string[];
/**
 * NOTE: currently unused by `intlMiddleware`'s actual routing logic (it
 * always rewrites for `defaultLocale` and redirects otherwise) — reserved
 * for future use. Setting `localePrefix` on {@link RoutingConfig} has no
 * runtime effect yet.
 */
export type LocalePrefixMode = 'always' | 'as-needed' | 'never';
/**
 * The config object you build with `setIntlConfig` and export from the file
 * referenced by the `@intl-config` alias in `next.config` (see the package
 * README's Setup section). Consumed internally by `intlMiddleware`,
 * `getLocale`, `getTranslations`, and friends.
 */
export interface RoutingConfig<AppLocales extends Locales, AppLocalePrefixMode extends LocalePrefixMode> {
    /**
     * All available locales.
     */
    locales: AppLocales;
    /**
     * Used when no locale matches.
     */
    defaultLocale: string;
    /**
     * Configures whether and which prefix is shown for a given locale.
     **/
    localePrefix?: AppLocalePrefixMode;
    /**
     * Can be used to disable the locale cookie or to customize it.
     */
    localeCookie?: false | CookieAttributes;
    /**
     * By setting this to `false`, the cookie as well as the `accept-language` header will no longer be used for locale detection.
     **/
    localeDetection?: boolean;
}
export interface CookieAttributes {
    /**
     * Specifies the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.3|Domain Set-Cookie attribute}. By default, no
     * domain is set, and most clients will consider the cookie to apply to only
     * the current domain.
     */
    domain?: string | undefined;
    /**
     * Specifies a function that will be used to encode a cookie's value. Since
     * value of a cookie has a limited character set (and must be a simple
     * string), this function can be used to encode a value into a string suited
     * for a cookie's value.
     *
     * The default function is the global `encodeURIComponent`, which will
     * encode a JavaScript string into UTF-8 byte sequences and then URL-encode
     * any that fall outside of the cookie range.
     */
    encode?(value: string): string;
    /**
     * Specifies the `Date` object to be the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.1|`Expires` `Set-Cookie` attribute}. By default,
     * no expiration is set, and most clients will consider this a "non-persistent cookie" and will delete
     * it on a condition like exiting a web browser application.
     *
     * *Note* the {@link https://tools.ietf.org/html/rfc6265#section-5.3|cookie storage model specification}
     * states that if both `expires` and `maxAge` are set, then `maxAge` takes precedence, but it is
     * possible not all clients by obey this, so if both are set, they should
     * point to the same date and time.
     */
    expires?: Date | undefined;
    /**
     * Specifies the boolean value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.6|`HttpOnly` `Set-Cookie` attribute}.
     * When truthy, the `HttpOnly` attribute is set, otherwise it is not. By
     * default, the `HttpOnly` attribute is not set.
     *
     * *Note* be careful when setting this to true, as compliant clients will
     * not allow client-side JavaScript to see the cookie in `document.cookie`.
     */
    httpOnly?: boolean | undefined;
    /**
     * Specifies the number (in seconds) to be the value for the `Max-Age`
     * `Set-Cookie` attribute. The given number will be converted to an integer
     * by rounding down. By default, no maximum age is set.
     *
     * *Note* the {@link https://tools.ietf.org/html/rfc6265#section-5.3|cookie storage model specification}
     * states that if both `expires` and `maxAge` are set, then `maxAge` takes precedence, but it is
     * possible not all clients by obey this, so if both are set, they should
     * point to the same date and time.
     */
    maxAge?: number | undefined;
    /**
     * Specifies the `boolean` value for the [`Partitioned` `Set-Cookie`](rfc-cutler-httpbis-partitioned-cookies)
     * attribute. When truthy, the `Partitioned` attribute is set, otherwise it is not. By default, the
     * `Partitioned` attribute is not set.
     *
     * **note** This is an attribute that has not yet been fully standardized, and may change in the future.
     * This also means many clients may ignore this attribute until they understand it.
     *
     * More information about can be found in [the proposal](https://github.com/privacycg/CHIPS)
     */
    partitioned?: boolean | undefined;
    /**
     * Specifies the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.4|`Path` `Set-Cookie` attribute}.
     * By default, the path is considered the "default path".
     */
    path?: string | undefined;
    /**
     * Specifies the `string` to be the value for the [`Priority` `Set-Cookie` attribute][rfc-west-cookie-priority-00-4.1].
     *
     * - `'low'` will set the `Priority` attribute to `Low`.
     * - `'medium'` will set the `Priority` attribute to `Medium`, the default priority when not set.
     * - `'high'` will set the `Priority` attribute to `High`.
     *
     * More information about the different priority levels can be found in
     * [the specification][rfc-west-cookie-priority-00-4.1].
     *
     * **note** This is an attribute that has not yet been fully standardized, and may change in the future.
     * This also means many clients may ignore this attribute until they understand it.
     */
    priority?: "low" | "medium" | "high" | undefined;
    /**
     * Specifies the boolean or string to be the value for the {@link https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-4.1.2.7|`SameSite` `Set-Cookie` attribute}.
     *
     * - `true` will set the `SameSite` attribute to `Strict` for strict same
     * site enforcement.
     * - `false` will not set the `SameSite` attribute.
     * - `'lax'` will set the `SameSite` attribute to Lax for lax same site
     * enforcement.
     * - `'strict'` will set the `SameSite` attribute to Strict for strict same
     * site enforcement.
     *  - `'none'` will set the SameSite attribute to None for an explicit
     *  cross-site cookie.
     *
     * More information about the different enforcement levels can be found in {@link https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-4.1.2.7|the specification}.
     *
     * *note* This is an attribute that has not yet been fully standardized, and may change in the future. This also means many clients may ignore this attribute until they understand it.
     */
    sameSite?: true | false | "lax" | "strict" | "none" | undefined;
    /**
     * Specifies the boolean value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.5|`Secure` `Set-Cookie` attribute}. When truthy, the
     * `Secure` attribute is set, otherwise it is not. By default, the `Secure` attribute is not set.
     *
     * *Note* be careful when setting this to `true`, as compliant clients will
     * not send the cookie back to the server in the future if the browser does
     * not have an HTTPS connection.
     */
    secure?: boolean | undefined;
}
export type TranslationEntry = string | TranslationObject;
export interface TranslationObject {
    [key: string]: TranslationEntry;
}
export type ReturnType = any;
export type TranslatorReturnType = (key: string) => ReturnType;
export type changeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | undefined;
export type Alternates = {
    languages?: Languages<string> | undefined;
} | undefined;
export interface IntlSitemap {
    link?: string;
    changeFrequency?: changeFrequency;
    priority?: number | undefined;
    images?: string[] | undefined;
    lastModified: Date | string | undefined;
    videos?: Videos[] | undefined;
}

/**
 * Whether the firebase_auth redirects should carry the request's query
 * string over to their target. Defaults to `true` — see
 * `FirebaseAuthRoutingConfig.preserveRedirectQuery`.
 */
export declare function preserveRedirectQueryEnabled(): boolean;
/**
 * Appends `search` to a redirect target path, honoring the
 * `preserveRedirectQuery` setting. Shared by all three places that redirect
 * to `redirectAuthPath`/`homePath`/`verifyEmailPath` — the middleware
 * (`update_session`), the RSC pre-render redirect
 * (`resolveAuthUserAndRedirect`), and the client `AuthUserProvider` effect —
 * so they can't drift apart on whether a query string survives.
 *
 * @param search Leading-`?` query string (`''` when there is none), from
 *   `request.nextUrl.search`, the `x-search` header, or
 *   `window.location.search` depending on the caller's runtime.
 */
export default function withRedirectQuery(target: string, search: string): string;

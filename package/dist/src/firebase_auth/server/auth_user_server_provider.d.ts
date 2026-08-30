import type { SerializedAuthUser } from '../types.js';
/**
 * Resolves the signed-in user from the session cookie and performs the
 * authoritative pre-render redirect (guest→`redirectAuthPath`, signed-in→
 * `homePath` on auth pages) — middleware only checks cookie *presence*, not
 * validity; a forged, expired, or otherwise invalid-but-present cookie
 * sails through it. Only this function's token validation
 * (`getAuthenticatedAppForUser`) catches that, so this redirect must happen
 * here, before any HTML is sent — relying solely on the client
 * `AuthUserProvider` effect to redirect afterwards produces a visible
 * flash (page renders signed-in, then bounces). Plain async function, not
 * a component: callers decide where/how to use the resolved user relative
 * to their own component tree (see `AuthUserServerProvider` below for the
 * simple case, and `IntlProvider`'s auto-wiring for the case where ordering
 * against `LocaleContext` matters).
 */
export declare function resolveAuthUserAndRedirect(): Promise<SerializedAuthUser | null>;
/**
 * Convenience component for the manual-override path
 * (`firebaseAuth.middlewareEnabled: false`-style manual wiring): resolves +
 * redirects, then wraps `children` in the client `AuthUserProvider`
 * directly. NOT used by the default auto-wiring path — `IntlProvider`/
 * `LocationzationClientProvider` call `resolveAuthUserAndRedirect` and the
 * client `AuthUserProvider` separately instead, so the client provider can
 * render inside `LocaleContext.Provider` rather than outside it.
 */
export default function AuthUserServerProvider({ children }: {
    children: React.ReactNode;
}): Promise<import("react").JSX.Element>;

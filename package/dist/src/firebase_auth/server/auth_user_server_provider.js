import { jsx as _jsx } from "react/jsx-runtime";
import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getAuthenticatedAppForUser } from './firebase_server';
const AuthUserProvider = dynamic(() => import('../client/auth_user_provider'));
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
export async function resolveAuthUserAndRedirect() {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const { currentUser } = await getAuthenticatedAppForUser();
    const path = (await headers()).get('x-pathname') ?? '/';
    const isAuthPage = fa.isAuthPath(path);
    const isWhiteListed = fa.whiteListPaths?.includes(path) ?? false;
    if (!isWhiteListed) {
        if (!currentUser && !isAuthPage)
            redirect(fa.redirectAuthPath);
        if (currentUser && isAuthPage)
            redirect(fa.homePath);
    }
    return currentUser && {
        uid: currentUser.uid,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        displayName: currentUser.displayName,
    };
}
/**
 * Convenience component for the manual-override path
 * (`firebaseAuth.middlewareEnabled: false`-style manual wiring): resolves +
 * redirects, then wraps `children` in the client `AuthUserProvider`
 * directly. NOT used by the default auto-wiring path — `IntlProvider`/
 * `LocationzationClientProvider` call `resolveAuthUserAndRedirect` and the
 * client `AuthUserProvider` separately instead, so the client provider can
 * render inside `LocaleContext.Provider` rather than outside it.
 */
export default async function AuthUserServerProvider({ children }) {
    const initialUser = await resolveAuthUserAndRedirect();
    return _jsx(AuthUserProvider, { initialUser: initialUser, children: children });
}

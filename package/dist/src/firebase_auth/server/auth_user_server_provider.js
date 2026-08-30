import { jsx as _jsx } from "react/jsx-runtime";
import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import { getAuthenticatedAppForUser } from './firebase_server.js';
import withRedirectQuery from '../preserve_redirect_query.js';
import isWhitelisted from '../is_whitelisted.js';
const AuthUserProvider = dynamic(() => import('../client/auth_user_provider.js'));
export async function resolveAuthUserAndRedirect() {
    const fa = config.firebaseAuth;
    requireFirebaseAuthConfig(fa);
    const { currentUser } = await getAuthenticatedAppForUser();
    const requestHeaders = await headers();
    const path = requestHeaders.get('x-pathname') ?? '/';
    const isAuthPage = fa.isAuthPath(path);
    const isWhiteListed = isWhitelisted(path, fa.whiteListPaths);
    const search = requestHeaders.get('x-search') ?? '';
    if (!isWhiteListed) {
        if (!currentUser && !isAuthPage)
            redirect(withRedirectQuery(fa.redirectAuthPath, search));
        if (currentUser && isAuthPage)
            redirect(withRedirectQuery(fa.homePath, search));
    }
    return currentUser && {
        uid: currentUser.uid,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        displayName: currentUser.displayName,
    };
}
export default async function AuthUserServerProvider({ children }) {
    const initialUser = await resolveAuthUserAndRedirect();
    return _jsx(AuthUserProvider, { initialUser: initialUser, children: children });
}

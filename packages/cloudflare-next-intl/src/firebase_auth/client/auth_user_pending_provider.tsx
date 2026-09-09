'use client';

import { useMemo } from 'react';
import { AuthUserContext, type AuthUserContextType } from './auth_user_context.js';
import type { SerializedAuthUser } from '../types.js';

function notReady(): Promise<never> {
    return Promise.reject(new Error('AuthUserProvider is still loading'));
}

/**
 * Stand-in context for the window in which the real `AuthUserProvider`'s
 * chunk is still downloading.
 *
 * `useLazyWrappingProvider` deliberately keeps `children` mounted while that
 * chunk loads, so a child calling `useAuthUser()` during hydration would
 * otherwise hit the `null` default and throw
 * "useAuthUser must be used within an AuthUserProvider" — caught by the
 * nearest error boundary, which flashes the error page for the few hundred
 * milliseconds until the chunk lands.
 *
 * The value published here mirrors `AuthUserProvider`'s own seed state
 * (`user: initialUser`, `loading: initialUser === null`), so a consumer sees
 * no state change when the real provider takes over.
 */
export default function AuthUserPendingProvider({ initialUser = null, children }: {
    initialUser?: SerializedAuthUser | null;
    children?: React.ReactNode;
}): React.JSX.Element {
    const value = useMemo<AuthUserContextType>(() => ({
        user: initialUser,
        loading: initialUser === null,
        reloadUser: notReady,
        sendVerificationEmail: notReady,
        logout: notReady,
    }), [initialUser]);

    return <AuthUserContext.Provider value={value}>{children}</AuthUserContext.Provider>;
}

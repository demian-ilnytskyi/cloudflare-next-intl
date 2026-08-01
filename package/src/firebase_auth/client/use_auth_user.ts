'use client';

import { useContext } from 'react';
import { AuthUserContext, type AuthUserContextType } from './auth_user_provider';

/**
 * Reads the current Firebase auth user and its actions from
 * `AuthUserProvider`'s context.
 *
 * @throws If called without an `AuthUserProvider` above it in the tree.
 * @example
 * const { user, loading, logout } = useAuthUser();
 * if (loading) return null;
 * return user ? <button onClick={logout}>Log out</button> : null;
 */
export default function useAuthUser(): AuthUserContextType {
    const context = useContext(AuthUserContext);
    if (context === null) {
        throw new Error('useAuthUser must be used within an AuthUserProvider');
    }
    return context;
}

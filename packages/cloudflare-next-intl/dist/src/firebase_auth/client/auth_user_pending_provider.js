'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { AuthUserContext } from './auth_user_context.js';
function notReady() {
    return Promise.reject(new Error('AuthUserProvider is still loading'));
}
export default function AuthUserPendingProvider({ initialUser = null, children }) {
    const value = useMemo(() => ({
        user: initialUser,
        loading: initialUser === null,
        reloadUser: notReady,
        sendVerificationEmail: notReady,
        logout: notReady,
    }), [initialUser]);
    return _jsx(AuthUserContext.Provider, { value: value, children: children });
}

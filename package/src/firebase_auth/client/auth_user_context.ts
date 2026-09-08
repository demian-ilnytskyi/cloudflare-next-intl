'use client';

import { createContext } from 'react';
import type { AuthActionCodeSettings, AuthUser } from '../types.js';

export interface AuthUserContextType {
    /** Current Firebase user, or `null` if signed out (or not yet resolved while `loading`). */
    user: AuthUser | null;
    /** `true` until the initial auth state has resolved on the client. */
    loading: boolean;
    /** Force-refreshes the current user's ID token/claims and re-syncs the session cookie. */
    reloadUser: () => Promise<void>;
    /** Sends a verification email to the currently signed-in user. */
    sendVerificationEmail: (actionCodeSettings?: AuthActionCodeSettings) => Promise<void>;
    /** Signs out, clears the session cookie, and redirects to `firebaseAuth.redirectAuthPath`. */
    logout: () => Promise<void>;
}

// `null` default (instead of a `{ loading: true, ... }` stand-in) lets
// `useAuthUser` distinguish "not wrapped in AuthUserProvider" (throw) from
// "wrapped, still loading" (`loading: true`).
//
// Lives in its own module so `useAuthUser` and the pending-window stand-in
// (`AuthUserPendingProvider`) can reach the context without importing
// `auth_user_provider.js` — that module pulls in the Firebase client SDK,
// which is exactly the chunk being lazily loaded.
export const AuthUserContext = createContext<AuthUserContextType | null>(null);

export default AuthUserContext;

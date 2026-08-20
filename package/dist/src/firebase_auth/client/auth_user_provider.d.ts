import type { AuthActionCodeSettings, AuthUser, SerializedAuthUser } from '../types';
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
export declare const AuthUserContext: import("react").Context<AuthUserContextType | null>;
/**
 * Client-side auth-state provider for `firebase_auth`. Wrap your root layout
 * (or a client boundary below it) with this to make `useAuthUser()`
 * (`cloudflare-next-intl/useFirebaseAuthUser`, client variant) resolve
 * `{ user, loading }` from the live Firebase `onIdTokenChanged` listener,
 * and to get automatic session-cookie sync + redirect-on-sign-out/verify
 * behavior driven by `firebaseAuth.isAuthPath` / `whiteListPaths` /
 * `redirectAuthPath` / `verifyEmailPath` on your `RoutingConfig`.
 *
 * Requires `firebaseAuth` to be set on the config passed to `setIntlConfig`
 * — throws via {@link requireFirebaseAuthConfig} otherwise.
 *
 * @param initialUser Server-resolved user (e.g. from
 *   `useFirebaseAuthUser`'s `react-server` variant) to avoid a
 *   loading flash on first paint; pass `null`/omit if unavailable.
 * @example
 * <AuthUserProvider initialUser={initialUser}>{children}</AuthUserProvider>
 */
export default function AuthUserProvider({ initialUser, children }: {
    initialUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): import("react").JSX.Element;

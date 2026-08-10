import type { User } from 'firebase/auth';
import { getAuthenticatedAppForUser } from './firebase_server';

/**
 * Resolves the current request's authenticated Firebase user.
 * @returns `{ user, loading: false }` — `loading` is always `false` here;
 *   server resolution is synchronous with respect to the awaited call.
 */
async function iGetAuthUser(): Promise<{ user: User | null; loading: false }> {
    const { currentUser } = await getAuthenticatedAppForUser();
    return { user: currentUser, loading: false };
}

/**
 * Server Component/Action only: resolves the current request's
 * authenticated Firebase user, same style as {@link getLocale}/
 * {@link getTranslations} — an unconditional, always-`async` export
 * (`cloudflare-next-intl/getFirebaseAuthUser`), so the `await` requirement
 * is visible from the type itself in every editor.
 *
 * Returns the same `{ user, loading }` shape the client `useAuthUser()`
 * hook's context exposes, so `const { user } = await getAuthUser()`
 * generalizes correctly from `const { user } = useAuthUser()` on the client.
 *
 * @example
 * ```tsx
 * const { user } = await getAuthUser();
 * ```
 */
export const getAuthUser = iGetAuthUser;

/**
 * Server Component counterpart of the client `useAuthUser()` hook, reached
 * via `cloudflare-next-intl/useFirebaseAuthUser`'s `react-server` condition
 * (resolved automatically — not meant to be imported directly by name).
 * Prefer {@link getAuthUser} for an unconditional, editor-typed-as-async
 * equivalent.
 */
export default async function useAuthUser(): Promise<{ user: User | null; loading: false }> {
    return getAuthUser();
}

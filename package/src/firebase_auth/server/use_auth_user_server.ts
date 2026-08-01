import type { User } from 'firebase/auth';
import { getAuthenticatedAppForUser } from './firebase_server';

/**
 * Server Component counterpart of the client `useAuthUser()` hook (from
 * `cloudflare-next-intl/useFirebaseAuthUser`'s `default` condition — this
 * file is that same subpath's `react-server` condition, resolved
 * automatically, not a separately-imported function). Reads through the
 * same `cache()`-wrapped `getAuthenticatedAppForUser`, so every server
 * component calling this within one request shares one lookup.
 *
 * Returns the same `{ user, loading }` shape the client variant's context
 * exposes (`loading` is always `false` here — server resolution is
 * synchronous with respect to the awaited call), so code reading
 * `const { user } = await useAuthUser()` generalizes correctly from
 * `const { user } = useAuthUser()` on the client side.
 */
export default async function useAuthUser(): Promise<{ user: User | null; loading: false }> {
    const { currentUser } = await getAuthenticatedAppForUser();
    return { user: currentUser, loading: false };
}

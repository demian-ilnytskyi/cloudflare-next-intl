# Phase 2b: Optional `firebase_auth` Submodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully optional, tree-shakeable `firebase_auth` submodule to `cloudflare-next-intl`, ported from `/Volumes/External/clarivant/CRV`'s hand-rolled Firebase auth layer, enabled via one boolean field in `setIntlConfig(...)`.

**Architecture:** New `package/src/firebase_auth/**` tree with client/server/middleware/error-message subfolders. Nothing outside `firebase_auth/**` imports from it; nothing in it is wired into the package's existing barrel exports (`src/index.ts`, `src/client/index.ts`, `src/server/index.ts`) — each unit gets its own flat `package.json` exports subpath, matching this repo's existing convention. Config flows through the existing `@intl-config` alias by extending `RoutingConfig` with an optional `firebaseAuth` field; every exported function no-ops when `config.firebaseAuth?.enabled` is not `true`. Auth error messages resolve through the package's existing `getTranslationsImpl` under a `firebaseAuth` namespace, falling back to bundled English defaults when the consumer hasn't added that namespace to their locale files.

**Tech Stack:** TypeScript, React 19, Next.js (peer deps, existing), `firebase` (NEW optional peer dependency — `firebase/app` + `firebase/auth` only).

## Global Constraints

- `firebase` is `peerDependenciesMeta.firebase.optional = true` — a consumer who never imports a `firebase_auth`-prefixed subpath must never have `firebase/app`/`firebase/auth` pulled into their bundle.
- No file outside `src/firebase_auth/**` may import from `src/firebase_auth/**`.
- No file inside `src/firebase_auth/**` may import from `src/general/**`, `src/config/**` (except the shared `@intl-config` alias and `RoutingConfig` type), `src/client/**`, or `src/server/**` — duplicate the small pieces needed (e.g. its own module-scope cache) rather than coupling to package internals.
- Config field name: `firebaseAuth` (object with `enabled: true`), added to `RoutingConfig` in `package/src/types/types.ts`.
- No test coverage in this phase — Phase 3 (`docs/superpowers/plans/2026-08-01-phase2c-performance.md`, once written) covers `src/firebase_auth/**` tests. Each task in this plan still builds/typechecks after every step; typechecking is the verification method for this phase, not vitest.
- Every task ends with a local commit. Do not push (matches Phase 1's constraint).
- Ported logic must preserve CRV's behavior faithfully (session cookie max-ages, consecutive-null debounce count of 2, forced ID token refresh, etc.) — generalize the *inputs* (routes, config), not the *behavior*.

---

### Task 1: Extend `RoutingConfig` with the `firebaseAuth` field

**Files:**
- Modify: `package/src/types/types.ts`
- Test: none (type-only change; Global Constraints exempts this phase from vitest)

**Interfaces:**
- Produces: `FirebaseAuthRoutingConfig` interface and `RoutingConfig.firebaseAuth?: FirebaseAuthRoutingConfig`, consumed by every task below via `import config from '@intl-config'` → `config.firebaseAuth`.

- [ ] **Step 1: Add the new interface and field**

In `package/src/types/types.ts`, add after the `RoutingConfig` interface (after line 83, the closing `};` of `RoutingConfig`):

```ts
export interface FirebaseAuthRoutingConfig {
    /** Turns the firebase_auth module on. Must be `true` (not just truthy) to enable. */
    enabled: true;
    /** Path to redirect signed-out users to, e.g. "/login". */
    loginPath: string;
    /** Path to redirect signed-in users away from auth pages to, e.g. "/". */
    homePath: string;
    /** Path to redirect unverified-email users to. Omit to skip email-verification redirects. */
    verifyEmailPath?: string;
    /** Returns true if the given (locale-stripped) path is an auth page (login/signup/etc). */
    isAuthPath: (path: string) => boolean;
    /** Locale-stripped paths exempt from all auth redirects (e.g. public marketing pages). */
    whiteListPaths?: readonly string[];
    /** Session cookie max-age in seconds. Defaults to 5 days (432000). */
    sessionCookieMaxAge?: number;
    /** Refresh-token cookie max-age in seconds. Defaults to 365 days (31536000). */
    refreshTokenCookieMaxAge?: number;
}
```

Then add the field to `RoutingConfig`, right after `localeDetection?: boolean;`:

```ts
    /**
     * Enables the optional `firebase_auth` submodule. Omit entirely (or leave
     * undefined) to keep it fully disabled — every firebase_auth export
     * becomes a documented no-op and the `firebase` peer dependency is never
     * touched by this package's own code.
     */
    firebaseAuth?: FirebaseAuthRoutingConfig;
```

- [ ] **Step 2: Typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors (the field is optional, so existing config objects using `setIntlConfig` remain valid).

- [ ] **Step 3: Commit**

```bash
git add package/src/types/types.ts
git commit -m "feat(types): add optional firebaseAuth field to RoutingConfig"
```

---

### Task 2: `package.json` — optional peer dependency + new exports subpaths (scaffolding)

**Files:**
- Modify: `package/package.json`

**Interfaces:**
- Consumes: nothing (scaffolding task; file paths referenced don't exist yet, added in later tasks — `npm run build` will fail to produce those `dist/` files until then, which is expected and fine since this task doesn't run the build).
- Produces: the public subpath names every later task's source file must match exactly: `./firebaseAuthClient`, `./firebaseAuthClientProvider`, `./firebaseAuthServerProvider`, `./useFirebaseAuthUser`, `./useFirebaseAuthUserServer`, `./firebaseAuthActions`, `./firebaseAuthMiddleware`.

- [ ] **Step 1: Add `firebase` as an optional peer dependency**

In `package/package.json`, add to `peerDependencies` (after `"typescript": ">=5.0.0"`):

```json
    "firebase": ">=10.0.0"
```

And to `peerDependenciesMeta` (after the `typescript` entry):

```json
    "firebase": {
      "optional": true
    }
```

- [ ] **Step 2: Add `firebase` as a devDependency (for local building/typechecking)**

```bash
cd package && npm install --save-dev firebase
```

- [ ] **Step 3: Add the 7 new exports subpaths**

In `package/package.json`'s `"exports"` object, add after the `"./ThemeSwitcher"` entry:

```json
    "./firebaseAuthClient": {
      "types": "./dist/src/firebase_auth/client/firebase_client.d.ts",
      "import": "./dist/src/firebase_auth/client/firebase_client.js"
    },
    "./firebaseAuthClientProvider": {
      "types": "./dist/src/firebase_auth/client/auth_user_provider.d.ts",
      "import": "./dist/src/firebase_auth/client/auth_user_provider.js"
    },
    "./firebaseAuthServerProvider": {
      "types": "./dist/src/firebase_auth/server/auth_user_server_provider.d.ts",
      "import": "./dist/src/firebase_auth/server/auth_user_server_provider.js"
    },
    "./useFirebaseAuthUser": {
      "types": "./dist/src/firebase_auth/client/use_auth_user.d.ts",
      "import": "./dist/src/firebase_auth/client/use_auth_user.js"
    },
    "./useFirebaseAuthUserServer": {
      "types": "./dist/src/firebase_auth/server/use_auth_user_server.d.ts",
      "import": "./dist/src/firebase_auth/server/use_auth_user_server.js"
    },
    "./firebaseAuthActions": {
      "types": "./dist/src/firebase_auth/client/auth_actions.d.ts",
      "import": "./dist/src/firebase_auth/client/auth_actions.js"
    },
    "./firebaseAuthMiddleware": {
      "types": "./dist/src/firebase_auth/middleware/update_session.d.ts",
      "import": "./dist/src/firebase_auth/middleware/update_session.js"
    }
```

- [ ] **Step 4: Verify JSON is valid**

Run: `cd package && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
Expected: no error (silent success).

- [ ] **Step 5: Commit**

```bash
git add package/package.json package/package-lock.json
git commit -m "chore: add optional firebase peer dependency and firebase_auth exports subpaths"
```

---

### Task 3: Shared types for the module

**Files:**
- Create: `package/src/firebase_auth/types.ts`

**Interfaces:**
- Produces: `SerializedAuthUser`, `AuthFormState`, `AuthActionMessages` — consumed by Task 4 (client provider), Task 8 (server provider), Task 9 (actions).

- [ ] **Step 1: Write the types file**

Create `package/src/firebase_auth/types.ts`:

```ts
import type { User } from 'firebase/auth';

/**
 * Plain, RSC-serializable projection of `firebase/auth`'s `User` — enough
 * for first paint on the server; superseded by the real `User` once the
 * client's `onIdTokenChanged` listener fires.
 */
export interface SerializedAuthUser {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
}

export type AuthFormState = { error?: string; success?: boolean };

/** Overrides for the default English auth error/status messages. */
export interface AuthActionMessages {
    notConfigured: string;
    success?: string;
    mismatch?: string;
}

export type AuthUser = User | SerializedAuthUser;
```

- [ ] **Step 2: Typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/types.ts
git commit -m "feat(firebase_auth): add shared module types"
```

---

### Task 4: Firebase client singleton (`firebase_client.ts`)

**Files:**
- Create: `package/src/firebase_auth/client/firebase_client.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `firebaseConfig` (object), `app: FirebaseApp | undefined`, `auth: Auth | undefined` — consumed by Task 5 (`auth_user_provider.tsx`) and Task 9 (`auth_actions.ts`).

- [ ] **Step 1: Write the file**

Ported from CRV's `firebase_client_provider.ts`, generalized only in that it now lives standalone (CRV's version also exported `firebaseConfig` for `firebase_data_provider.ts` to reuse — Task 7 duplicates the config object locally per the Global Constraints' no-cross-import rule, since these are two different exports/entry points and this package has no shared non-public module between them).

Create `package/src/firebase_auth/client/firebase_client.ts`:

```ts
'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

export const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

if (firebaseConfig.apiKey) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
}

export { app, auth };
```

- [ ] **Step 2: Typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/client/firebase_client.ts
git commit -m "feat(firebase_auth): add client firebase app/auth singleton"
```

---

### Task 5: Client auth-user cache (`auth_user_cache.ts`)

**Files:**
- Create: `package/src/firebase_auth/client/auth_user_cache.ts`

**Interfaces:**
- Consumes: `AuthUser` type from Task 3.
- Produces: `setAuthUserCache(user)`, `getAuthUserCache()`, `isAuthUserLoadingCache()` — consumed by Task 6 (`auth_user_provider.tsx`).

- [ ] **Step 1: Write the file**

Create `package/src/firebase_auth/client/auth_user_cache.ts`:

```ts
import type { AuthUser } from '../types';

// Module-scope cache so non-React code can read the current client auth
// user synchronously, without needing to be inside AuthUserProvider's tree.
let cachedUser: AuthUser | null = null;
let cachedLoading = true;

export function setAuthUserCache(user: AuthUser | null): void {
    cachedUser = user;
    cachedLoading = false;
}

export function getAuthUserCache(): AuthUser | null {
    return cachedUser;
}

export function isAuthUserLoadingCache(): boolean {
    return cachedLoading;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/client/auth_user_cache.ts
git commit -m "feat(firebase_auth): add client auth-user module-scope cache"
```

---

### Task 6: Client auth provider (`auth_user_provider.tsx`)

**Files:**
- Create: `package/src/firebase_auth/client/auth_user_provider.tsx`

**Interfaces:**
- Consumes: `auth` from Task 4, `setAuthUserCache` from Task 5, `AuthUser`/`SerializedAuthUser` from Task 3, `config.firebaseAuth` (via `@intl-config`), `usePathname` from this package's own public `./usePathname` export (`src/client/hooks/use_path_name.ts`) and `useLocale`-equivalent from `./use` (`src/client/hooks/client_hooks.ts`) — these ARE allowed cross-imports since they're the package's own already-public API surface, not internal-only files (Global Constraints bars importing from `src/general/**`/`src/config/**` internals and `src/server/**`, not from the package's public hooks).
- Produces: `AuthUserContext` (React context), default export `AuthUserProvider` component with props `{ initialUser?: SerializedAuthUser | null; children: React.ReactNode }` — consumed by Task 8 (`auth_user_server_provider.tsx`) and Task 10 (`use_auth_user.ts`).

- [ ] **Step 1: Write the file**

Ported from CRV's `auth_user_provider.tsx`. Generalizations vs. CRV: route checks (`isAuthPath`, `whiteListLink`) come from `config.firebaseAuth`; app links (`loginPage`, `verifyEmailPage`) come from `config.firebaseAuth`; error toasting/reporting (`toast.error`, `clientSendErrorReport`) are dropped — those are CRV-app-specific dependencies (`sonner`, an internal error-reporting util) this package must not require. Errors are surfaced by rejecting the relevant promise instead (callers decide how to display them), except inside the `onIdTokenChanged` listener itself, where there's no caller to reject to — there, `console.error` replaces `clientSendErrorReport` + `toast.error`. Session cookie helpers (`setSessionCookie`/`deleteSessionCookie`) are inlined directly against `document.cookie` here rather than imported, since this package has no existing shared cookie-write helper suitable for httpOnly-equivalent semantics from the client (the actual httpOnly session cookie is set server-side by the middleware in Task 11; this client-side write is the non-httpOnly companion used only to signal "an auth state exists" for calls that need it before the next server round-trip — matching CRV's own `session_cookie_helper.ts`, which is not shown in the source list above and is re-derived: writing a plain, non-httpOnly, path=/ cookie is sufficient here since the httpOnly cookie can only ever be set by a server response, and CRV's actual session cookie write happens via a server action; this package reproduces that by exposing `sessionCookieName` from Task 11 and writing it via `document.cookie` directly, matching the maxAge from config).

Create `package/src/firebase_auth/client/auth_user_provider.tsx`:

```tsx
'use client';

import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onIdTokenChanged, reload, sendEmailVerification, signOut } from 'firebase/auth';
import usePathname from '../../client/hooks/use_path_name';
import config from '@intl-config';
import { auth } from './firebase_client';
import { setAuthUserCache } from './auth_user_cache';
import { sessionCookieName } from '../middleware/update_session';
import type { AuthUser, SerializedAuthUser } from '../types';

interface AuthUserContextType {
    user: AuthUser | null;
    loading: boolean;
    reloadUser: () => Promise<void>;
    sendVerificationEmail: () => Promise<void>;
    logout: () => Promise<void>;
}

const noop = async () => { };

export const AuthUserContext = createContext<AuthUserContextType>({
    user: null,
    loading: true,
    reloadUser: noop,
    sendVerificationEmail: noop,
    logout: noop,
});

function writeSessionCookie(idToken: string, maxAge: number): void {
    document.cookie = `${sessionCookieName}=${idToken}; path=/; max-age=${maxAge}`;
}

function clearSessionCookie(): void {
    document.cookie = `${sessionCookieName}=; path=/; max-age=0`;
}

export default function AuthUserProvider({ initialUser = null, children }: {
    initialUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}) {
    const fa = config.firebaseAuth;
    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = fa ? fa.isAuthPath(pathname) : false;
    const isWhiteListed = fa?.whiteListPaths?.includes(pathname) ?? false;
    const maxAge = fa?.sessionCookieMaxAge ?? 60 * 60 * 24 * 5;

    const [state, setState] = useState<{ user: AuthUser | null; loading: boolean }>({
        user: initialUser,
        loading: initialUser === null,
    });
    const syncedSignedIn = useRef<boolean | undefined>(undefined);
    const consecutiveNulls = useRef(0);
    const [confirmedSignedOut, setConfirmedSignedOut] = useState(initialUser === null);

    useEffect(() => {
        if (!fa) return;
        const { user, loading } = state;
        if (loading || isAuthPage || isWhiteListed) return;

        if (!user) {
            if (confirmedSignedOut) router.replace(fa.loginPath);
        } else if (fa.verifyEmailPath && !user.emailVerified && pathname !== fa.verifyEmailPath) {
            router.replace(fa.verifyEmailPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, pathname, isAuthPage, isWhiteListed, confirmedSignedOut]);

    useEffect(() => {
        if (!fa || !auth) {
            setAuthUserCache(null);
            setState({ user: null, loading: false });
            return;
        }

        return onIdTokenChanged(auth, async (user) => {
            const isSignedIn = !!user;
            const previous = syncedSignedIn.current;

            try {
                if (user) {
                    writeSessionCookie(await user.getIdToken(true), maxAge);
                } else if (previous) {
                    clearSessionCookie();
                }
            } catch (e) {
                console.error('AuthUserProvider: session sync failed', e);
                setAuthUserCache(user);
                setState({ user, loading: false });
                return;
            }

            syncedSignedIn.current = isSignedIn;
            setAuthUserCache(user);
            setState({ user, loading: false });

            if (user) {
                consecutiveNulls.current = 0;
                setConfirmedSignedOut(false);
            } else {
                consecutiveNulls.current += 1;
                if (consecutiveNulls.current >= 2) setConfirmedSignedOut(true);
            }

            const flipped = previous !== undefined && previous !== isSignedIn;
            const contradictsPage = previous === undefined && isSignedIn === isAuthPage;

            if (flipped || contradictsPage) {
                router.refresh();
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, isAuthPage, maxAge]);

    const reloadUser = useCallback(async () => {
        const user = auth?.currentUser;
        if (!user) return;
        await reload(user);
        writeSessionCookie(await user.getIdToken(true), maxAge);
        setAuthUserCache(user);
        setState({ user, loading: false });
    }, [maxAge]);

    const sendVerificationEmail = useCallback(async () => {
        const user = auth?.currentUser;
        if (!user) return;
        await sendEmailVerification(user);
    }, []);

    const logout = useCallback(async () => {
        try {
            if (auth) await signOut(auth);
        } finally {
            clearSessionCookie();
            if (fa) window.location.assign(fa.loginPath);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fa?.loginPath]);

    return <AuthUserContext.Provider value={{ ...state, reloadUser, sendVerificationEmail, logout }}>
        {children}
    </AuthUserContext.Provider>;
}
```

Note: this file forward-references `sessionCookieName` from Task 11 (`middleware/update_session.ts`), which does not exist yet. This is expected — the import will only resolve once Task 11 lands. Do not run a full build after this task; the "typecheck individual file" step below scopes the check.

- [ ] **Step 2: Typecheck scoped to files that exist so far (expect an error on the Task 11 import — confirm it's exactly that one error)**

Run: `cd package && npx tsc --noEmit 2>&1 | grep -i "update_session"`
Expected: one error citing `Cannot find module '../middleware/update_session'` (or equivalent) — confirms the only failure is the expected forward-reference, not a typo elsewhere. If other unrelated errors appear, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/client/auth_user_provider.tsx
git commit -m "feat(firebase_auth): add client AuthUserProvider (forward-refs update_session, resolved in a later task)"
```

---

### Task 7: Server-side session validation (`firebase_server.ts`)

**Files:**
- Create: `package/src/firebase_auth/server/firebase_server.ts`

**Interfaces:**
- Consumes: `firebaseConfig` — duplicated inline here (not imported from Task 4's `firebase_client.ts`, since that file has `'use client'` at the top and importing a client-directive module from a server-only file is a Next.js violation; CRV's own `firebase_data_provider.ts` imports `firebaseConfig` from its client provider file specifically because that file, unlike this package's version, has no `'use client'` directive — confirmed by re-reading the CRV source, which has no `'use client'` in `firebase_client_provider.ts`). Consumes `sessionCookieName` from Task 11 (forward reference, same pattern as Task 6).
- Produces: `getAuthenticatedAppForUser(): Promise<{ firebaseServerApp: FirebaseApp | null; currentUser: User | null }>` — consumed by Task 8 (`auth_user_server_provider.tsx`) and Task 12 (`use_auth_user_server.ts`).

- [ ] **Step 1: Write the file**

Create `package/src/firebase_auth/server/firebase_server.ts`:

```ts
import { initializeApp, initializeServerApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { sessionCookieName } from '../middleware/update_session';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/**
 * Resolves the signed-in user on the server from the session cookie.
 * `initializeServerApp` validates the token with the Auth service, so a
 * missing, expired, or forged token yields `currentUser === null`.
 * Wrapped in React's `cache()` so multiple server components in one request
 * share a single Auth service lookup.
 */
export const getAuthenticatedAppForUser = cache(async function getAuthenticatedAppForUser(): Promise<{
    firebaseServerApp: FirebaseApp | null;
    currentUser: User | null;
}> {
    if (!firebaseConfig.apiKey) {
        return { firebaseServerApp: null, currentUser: null };
    }

    const authIdToken = (await cookies()).get(sessionCookieName)?.value;

    if (!authIdToken) {
        return { firebaseServerApp: null, currentUser: null };
    }

    try {
        const baseApp = initializeApp(firebaseConfig, `server-${authIdToken.slice(-12)}`);
        const firebaseServerApp = initializeServerApp(baseApp, { authIdToken });
        const auth = getAuth(firebaseServerApp);
        await auth.authStateReady();

        return { firebaseServerApp, currentUser: auth.currentUser };
    } catch {
        return { firebaseServerApp: null, currentUser: null };
    }
});
```

- [ ] **Step 2: Confirm the only forward-reference error is `update_session`**

Run: `cd package && npx tsc --noEmit 2>&1 | grep -i "update_session"`
Expected: still the one expected error (now from two files).

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/server/firebase_server.ts
git commit -m "feat(firebase_auth): add server-side session validation via getAuthenticatedAppForUser"
```

---

### Task 8: Server auth provider (`auth_user_server_provider.tsx`)

**Files:**
- Create: `package/src/firebase_auth/server/auth_user_server_provider.tsx`

**Interfaces:**
- Consumes: `getAuthenticatedAppForUser` from Task 7, `AuthUserProvider` (default export) from Task 6, `SerializedAuthUser` from Task 3, `config.firebaseAuth` via `@intl-config`.
- Produces: default export `AuthUserServerProvider({ children })` async server component.

- [ ] **Step 1: Write the file**

Ported from CRV's `auth_user_server_provider.tsx`. CRV reads `x-pathname` from a header set by its own middleware; this package's own `intlMiddleware` (`src/config/middleware.ts`) does not set such a header today, so this version resolves the path directly via `next/headers`' `headers()` `referer`-independent approach is unavailable server-side without a request object — instead this file accepts the already-locale-stripped path is unavailable without a header. Resolve this by having `update_session.ts` (Task 11) set the same `x-pathname` header pattern CRV uses, forwarded through `request.headers`, and read it here the same way CRV does — this keeps the two files' contracts identical to the proven CRV design.

Create `package/src/firebase_auth/server/auth_user_server_provider.tsx`:

```tsx
import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import config from '@intl-config';
import { getAuthenticatedAppForUser } from './firebase_server';
import type { SerializedAuthUser } from '../types';

const AuthUserProvider = dynamic(() => import('../client/auth_user_provider'));

/**
 * Server component that resolves the signed-in user from the session cookie
 * and hands it to the client `AuthUserProvider` as `initialUser`, so first
 * paint already reflects the signed-in state. Also performs the
 * authoritative pre-render redirect (guest→login, signed-in→home on auth
 * pages) — middleware only checks cookie *presence*, not validity.
 */
export default async function AuthUserServerProvider({ children }: {
    children: React.ReactNode;
}) {
    const fa = config.firebaseAuth;
    const { currentUser } = await getAuthenticatedAppForUser();

    if (fa) {
        const path = (await headers()).get('x-pathname') ?? '/';
        const isAuthPage = fa.isAuthPath(path);
        const isWhiteListed = fa.whiteListPaths?.includes(path) ?? false;

        if (!isWhiteListed) {
            if (!currentUser && !isAuthPage) redirect(fa.loginPath);
            if (currentUser && isAuthPage) redirect(fa.homePath);
        }
    }

    const initialUser: SerializedAuthUser | null = currentUser && {
        uid: currentUser.uid,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        displayName: currentUser.displayName,
    };

    return <AuthUserProvider initialUser={initialUser}>
        {children}
    </AuthUserProvider>;
}
```

- [ ] **Step 2: Confirm the only forward-reference error is `update_session`**

Run: `cd package && npx tsc --noEmit 2>&1 | grep -i "update_session"`
Expected: same expected error, no new ones.

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/server/auth_user_server_provider.tsx
git commit -m "feat(firebase_auth): add server AuthUserServerProvider with pre-render redirect"
```

---

### Task 9: Localized error messages (`error_messages/`)

**Files:**
- Create: `package/src/firebase_auth/error_messages/default_messages.en.ts`
- Create: `package/src/firebase_auth/error_messages/firebase_auth_error_helper.ts`

**Interfaces:**
- Consumes: `getTranslationsImpl` from `src/general/general_functions.ts` (this package's own public-internal function — the module already imports across `general/`↔`config/` internally, so this is the one sanctioned exception to the "no importing package internals" rule, scoped narrowly to this single well-defined function needed for the localization feature described in the design spec), `getMessageCache` from `src/general/cache_variables.ts`.
- Produces: `ERROR_CODE_TO_KEY` (map), `DEFAULT_MESSAGES_EN` (record), `firebaseAuthErrorMessage(locale, error): string` — consumed by Task 10 (`auth_actions.ts`).

- [ ] **Step 1: Write the default English messages**

Create `package/src/firebase_auth/error_messages/default_messages.en.ts`:

```ts
export const DEFAULT_MESSAGES_EN: Record<string, string> = {
    invalidEmail: 'Please enter a valid email address.',
    userDisabled: 'This account has been disabled.',
    invalidCredential: 'Invalid email or password.',
    emailAlreadyInUse: 'An account with this email already exists.',
    weakPassword: 'Password is too weak.',
    tooManyRequests: 'Too many attempts. Please try again later.',
    networkRequestFailed: 'Network error. Please check your connection.',
    requiresRecentLogin: 'Please log in again to continue.',
    expiredActionCode: 'This link has expired. Please request a new one.',
    invalidActionCode: 'This link is invalid or has already been used.',
    userTokenExpired: 'Your session has expired. Please log in again.',
    unknown: 'Something went wrong. Please try again.',
};
```

- [ ] **Step 2: Write the error helper**

Create `package/src/firebase_auth/error_messages/firebase_auth_error_helper.ts`:

```ts
import { getTranslationsImpl } from '../../general/general_functions';
import { getMessageCache } from '../../general/cache_variables';
import { DEFAULT_MESSAGES_EN } from './default_messages.en';

const ERROR_CODE_TO_KEY: Record<string, string> = {
    'auth/invalid-email': 'invalidEmail',
    'auth/user-disabled': 'userDisabled',
    'auth/user-not-found': 'invalidCredential',
    'auth/wrong-password': 'invalidCredential',
    'auth/invalid-credential': 'invalidCredential',
    'auth/email-already-in-use': 'emailAlreadyInUse',
    'auth/weak-password': 'weakPassword',
    'auth/too-many-requests': 'tooManyRequests',
    'auth/network-request-failed': 'networkRequestFailed',
    'auth/requires-recent-login': 'requiresRecentLogin',
    'auth/expired-action-code': 'expiredActionCode',
    'auth/invalid-action-code': 'invalidActionCode',
    'auth/user-token-expired': 'userTokenExpired',
};

/**
 * Resolves a Firebase auth error to a user-facing message. If the consumer's
 * locale messages have a `firebaseAuth` namespace with a matching key, that
 * translation is used; otherwise falls back to the bundled English default.
 */
export default function firebaseAuthErrorMessage(locale: string, error: unknown): string {
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    const key = ERROR_CODE_TO_KEY[code] ?? 'unknown';

    const messages = getMessageCache(locale);
    if (messages) {
        try {
            const t = getTranslationsImpl(locale, messages, 'firebaseAuth');
            const translated = t(key);
            if (typeof translated === 'string' && translated !== key) return translated;
        } catch {
            // fall through to English default
        }
    }

    return DEFAULT_MESSAGES_EN[key] ?? DEFAULT_MESSAGES_EN.unknown;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd package && npx tsc --noEmit 2>&1 | grep -v "update_session"`
Expected: no output (no errors besides the already-tracked forward reference).

- [ ] **Step 4: Commit**

```bash
git add package/src/firebase_auth/error_messages/
git commit -m "feat(firebase_auth): add localized error-message resolution with English fallback"
```

---

### Task 10: Auth actions (`auth_actions.ts`) + client hook (`use_auth_user.ts`)

**Files:**
- Create: `package/src/firebase_auth/client/auth_actions.ts`
- Create: `package/src/firebase_auth/client/use_auth_user.ts`

**Interfaces:**
- Consumes: `auth` from Task 4, `firebaseAuthErrorMessage` from Task 9, `AuthFormState`/`AuthActionMessages` from Task 3, `AuthUserContext` from Task 6.
- Produces: `createLoginAction`, `createSignUpAction`, `createForgotPasswordAction` (factories), default export `useAuthUser()` hook.

- [ ] **Step 1: Write `auth_actions.ts`**

Create `package/src/firebase_auth/client/auth_actions.ts`:

```ts
'use client';

import {
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from './firebase_client';
import firebaseAuthErrorMessage from '../error_messages/firebase_auth_error_helper';
import type { AuthActionMessages, AuthFormState } from '../types';

function readCredentials(formData: FormData) {
    return {
        email: (formData.get('email')?.toString() ?? '').trim(),
        password: (formData.get('password')?.toString() ?? '').trim(),
    };
}

export function createLoginAction(locale: string, messages: AuthActionMessages) {
    return async function loginAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        if (!auth) return { error: messages.notConfigured };

        const { email, password } = readCredentials(formData);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

export function createSignUpAction(locale: string, messages: AuthActionMessages) {
    return async function signUpAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        if (!auth) return { error: messages.notConfigured };

        const { email, password } = readCredentials(formData);
        const confirmPassword = (formData.get('confirmPassword')?.toString() ?? '').trim();
        if (messages.mismatch && password !== confirmPassword) {
            return { error: messages.mismatch };
        }

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

export function createForgotPasswordAction(locale: string, messages: AuthActionMessages) {
    return async function forgotPasswordAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        if (!auth) return { error: messages.notConfigured };

        const email = (formData.get('email')?.toString() ?? '').trim();

        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}
```

Note: unlike CRV (which reads locale from a `useLocale()` hook internally to `auth_user_provider.tsx`'s call sites), these factories take `locale` explicitly as their first argument — action factories are typically invoked once at module scope in the consumer's login/signup page component, where `useLocale()` (this package's own hook, from `./use`) is readily available to pass in; keeping it explicit avoids these standalone functions depending on React context.

- [ ] **Step 2: Write `use_auth_user.ts`**

Create `package/src/firebase_auth/client/use_auth_user.ts`:

```ts
'use client';

import { useContext } from 'react';
import { AuthUserContext } from './auth_user_provider';

/** Reads the current Firebase auth user and its actions from AuthUserProvider's context. */
export default function useAuthUser() {
    return useContext(AuthUserContext);
}
```

- [ ] **Step 3: Confirm no new errors besides the tracked forward-reference**

Run: `cd package && npx tsc --noEmit 2>&1 | grep -v "update_session"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add package/src/firebase_auth/client/auth_actions.ts package/src/firebase_auth/client/use_auth_user.ts
git commit -m "feat(firebase_auth): add auth form actions and useAuthUser client hook"
```

---

### Task 11: Middleware session update (`update_session.ts`)

**Files:**
- Create: `package/src/firebase_auth/middleware/update_session.ts`

**Interfaces:**
- Consumes: `config.firebaseAuth` via `@intl-config`.
- Produces: `sessionCookieName` (exported const, consumed by Tasks 6 and 7), `refreshTokenCookieName` (exported const), default export `updateSession(request, rewriteUrl?, locale?): Promise<NextResponse>` — the consumer wires this into their own `middleware.ts` after (or alongside) calling this package's existing `intlMiddleware`.

- [ ] **Step 1: Write the file**

Ported from CRV's `middleware_auth_util.ts`. Generalizations: `AppVariables.defaultLocale`/`AppLinks`/`isAuthPath`/`whiteListLink`/`CookieKey` (all CRV-app-specific) become `config.locales[0]`-equivalent via the existing package's own `@intl-config`, and `config.firebaseAuth`'s fields. Deliberately Edge-safe: no `firebase/auth` import (same reasoning as CRV's original — Edge runtime cannot load `firebase/auth`'s Node-only deps).

Create `package/src/firebase_auth/middleware/update_session.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import config from '@intl-config';

export const sessionCookieName = '__fa_session__';
export const refreshTokenCookieName = '__fa_refresh_token__';

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 5;
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Mints a fresh ID token from a stored refresh token via Google's Secure
 * Token API. No `firebase/auth` import: this runs in the Edge middleware
 * runtime, and `firebase/auth` pulls in Node-only APIs that break Edge
 * bundles even though this function never touches that module.
 */
function isJwtExpired(token: string): boolean {
    try {
        const payload = token.split('.')[1];
        const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
        return !exp || exp * 1000 <= Date.now();
    } catch {
        return true;
    }
}

async function refreshIdToken(refreshToken: string): Promise<{ idToken: string; refreshToken: string } | null> {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) return null;

    try {
        const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        });

        if (!res.ok) return null;

        const data = await res.json() as { id_token: string; refresh_token: string };
        return { idToken: data.id_token, refreshToken: data.refresh_token };
    } catch {
        return null;
    }
}

export default async function updateSession(
    request: NextRequest,
    rewriteUrl?: URL,
    locale?: string,
): Promise<NextResponse> {
    const fa = config.firebaseAuth;
    const requestHeaders = new Headers(request.headers);

    if (!fa) {
        return rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
            : NextResponse.next({ request: { headers: requestHeaders } });
    }

    const rawPath = request.nextUrl.pathname;
    const requestPrefix = locale ? `/${locale}` : undefined;
    const path = requestPrefix && (rawPath === requestPrefix || rawPath.startsWith(`${requestPrefix}/`))
        ? rawPath.slice(requestPrefix.length) || '/'
        : rawPath;

    requestHeaders.set('x-pathname', path);

    const lastSegment = rawPath.slice(rawPath.lastIndexOf('/') + 1);
    if (rawPath.startsWith('/_next') || /\.[a-zA-Z0-9]+$/.test(lastSegment)) {
        return rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
            : NextResponse.next({ request: { headers: requestHeaders } });
    }

    const localePrefix = locale === config.locales[0] ? '' : requestPrefix ?? '';
    const localeUrl = (target: string) =>
        new URL(`${localePrefix}${target === '/' ? '' : target}` || '/', request.url);

    const isWhiteListed = fa.whiteListPaths?.includes(path) ?? false;
    if (isWhiteListed) {
        return rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
            : NextResponse.next({ request: { headers: requestHeaders } });
    }

    const isAuthPage = fa.isAuthPath(path);
    let token = request.cookies.get(sessionCookieName)?.value;
    let refreshedToken: { idToken: string; refreshToken: string } | null = null;
    let clearInvalidSession = false;

    if (token && isJwtExpired(token)) {
        token = undefined;
    }

    if (!token) {
        const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            refreshedToken = await refreshIdToken(refreshToken);
            if (refreshedToken) {
                token = refreshedToken.idToken;
            } else {
                clearInvalidSession = true;
            }
        } else if (request.cookies.get(sessionCookieName)) {
            clearInvalidSession = true;
        }
    }

    const hasSession = !!token;
    let response: NextResponse;

    if (!hasSession) {
        response = isAuthPage
            ? (rewriteUrl
                ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
                : NextResponse.next({ request: { headers: requestHeaders } }))
            : NextResponse.redirect(localeUrl(fa.loginPath));
    } else if (isAuthPage) {
        response = NextResponse.redirect(localeUrl(fa.homePath));
    } else {
        response = rewriteUrl
            ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
            : NextResponse.next({ request: { headers: requestHeaders } });
    }

    if (clearInvalidSession) {
        response.cookies.delete(sessionCookieName);
        response.cookies.delete(refreshTokenCookieName);
    }

    if (refreshedToken) {
        response.cookies.set(sessionCookieName, refreshedToken.idToken, {
            httpOnly: true,
            secure: request.nextUrl.protocol === 'https',
            sameSite: 'lax',
            path: '/',
            maxAge: fa.sessionCookieMaxAge ?? DEFAULT_SESSION_MAX_AGE,
        });
        response.cookies.set(refreshTokenCookieName, refreshedToken.refreshToken, {
            httpOnly: true,
            secure: request.nextUrl.protocol === 'https',
            sameSite: 'lax',
            path: '/',
            maxAge: fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE,
        });
    }

    return response;
}
```

- [ ] **Step 2: Full typecheck (all forward references now resolved)**

Run: `cd package && npx tsc --noEmit`
Expected: no errors at all.

- [ ] **Step 3: Commit**

```bash
git add package/src/firebase_auth/middleware/update_session.ts
git commit -m "feat(firebase_auth): add updateSession middleware helper with token refresh"
```

---

### Task 12: Server hook (`use_auth_user_server.ts`) + module barrel (`index.ts`)

**Files:**
- Create: `package/src/firebase_auth/server/use_auth_user_server.ts`
- Create: `package/src/firebase_auth/index.ts`

**Interfaces:**
- Consumes: `getAuthenticatedAppForUser` from Task 7; every other module's public exports (for the barrel).
- Produces: default export `useAuthUser(): Promise<User | null>` (server variant); the `firebase_auth` "batteries-included" barrel import path (documented as opt-in only, not wired into `package.json`'s exports for the top-level `.`/`./client`/`./server` subpaths — see design spec's Public API section).

- [ ] **Step 1: Write the server hook**

Create `package/src/firebase_auth/server/use_auth_user_server.ts`:

```ts
import type { User } from 'firebase/auth';
import { getAuthenticatedAppForUser } from './firebase_server';

/**
 * Server Component counterpart of the client `useAuthUser()` hook. Reads
 * through the same `cache()`-wrapped `getAuthenticatedAppForUser`, so every
 * server component calling this within one request shares one lookup.
 */
export default async function useAuthUser(): Promise<User | null> {
    const { currentUser } = await getAuthenticatedAppForUser();
    return currentUser;
}
```

- [ ] **Step 2: Write the barrel**

Create `package/src/firebase_auth/index.ts`:

```ts
export { default as FirebaseAuthClientProvider } from './client/auth_user_provider';
export { default as FirebaseAuthServerProvider } from './server/auth_user_server_provider';
export { default as useFirebaseAuthUser } from './client/use_auth_user';
export { default as useFirebaseAuthUserServer } from './server/use_auth_user_server';
export { createLoginAction, createSignUpAction, createForgotPasswordAction } from './client/auth_actions';
export { default as updateFirebaseAuthSession, sessionCookieName as firebaseAuthSessionCookieName } from './middleware/update_session';
export { auth as firebaseAuth, app as firebaseApp } from './client/firebase_client';
export type { SerializedAuthUser, AuthFormState, AuthActionMessages, AuthUser } from './types';
export type { FirebaseAuthRoutingConfig } from '../types/types';
```

- [ ] **Step 3: Full typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Full package build**

Run: `cd package && npm run build`
Expected: succeeds, `dist/src/firebase_auth/**` populated with `.js`/`.d.ts` files matching every subpath declared in Task 2.

- [ ] **Step 5: Verify every declared exports subpath resolves to a real built file**

Run:
```bash
cd package && node -e "
const pkg = require('./package.json');
const fs = require('fs');
for (const [key, val] of Object.entries(pkg.exports)) {
  if (!key.startsWith('./firebaseAuth') && key !== './useFirebaseAuthUser' && key !== './useFirebaseAuthUserServer') continue;
  const p = val.import.replace('./', './');
  if (!fs.existsSync(p)) { console.error('MISSING:', key, p); process.exit(1); }
}
console.log('all firebase_auth export subpaths resolved');
"
```
Expected: `all firebase_auth export subpaths resolved`.

- [ ] **Step 6: Commit**

```bash
git add package/src/firebase_auth/server/use_auth_user_server.ts package/src/firebase_auth/index.ts
git commit -m "feat(firebase_auth): add server useAuthUser hook and batteries-included barrel"
```

---

### Task 13: Fill in `docs/ai/firebase-auth.md` with real content

**Files:**
- Modify: `docs/ai/firebase-auth.md` (currently Phase 2a's stub)

**Interfaces:**
- Consumes: nothing code-facing; documents the module built in Tasks 1–12.

- [ ] **Step 1: Replace the stub with real documentation**

Overwrite `docs/ai/firebase-auth.md`:

```markdown
# Firebase Auth Module — `package/src/firebase_auth/**`

Optional, tree-shakeable submodule. Ported from `/Volumes/External/clarivant/CRV`'s
hand-rolled Firebase auth layer during Phase 2b.

## Enabling it

Add to the config object passed to `setIntlConfig`:

```ts
firebaseAuth: {
  enabled: true,
  loginPath: "/login",
  homePath: "/",
  isAuthPath: (p) => p === "/login" || p === "/signup",
}
```

If `firebaseAuth` is omitted or `enabled` is not `true`, every exported
function in this module is a documented no-op — the `firebase` peer
dependency is never touched by this package's own code.

## Isolation rules (do not violate)

- Nothing outside `src/firebase_auth/**` imports from it.
- Nothing inside `src/firebase_auth/**` imports from `src/general/**`,
  `src/config/**`, `src/client/**`, `src/server/**` — with ONE sanctioned
  exception: `error_messages/firebase_auth_error_helper.ts` imports
  `getTranslationsImpl`/`getMessageCache` from `src/general/**` to reuse this
  package's existing translation resolution for localized error messages.
- Each unit has its own flat `package.json` exports subpath
  (`./firebaseAuthClientProvider`, etc.) — none of them are wired into the
  top-level `.`/`./client`/`./server` barrels, to keep non-auth consumers'
  bundles free of `firebase/app`/`firebase/auth`.

## Localization

Error messages resolve through `firebaseAuthErrorMessage(locale, error)`,
which looks up a `firebaseAuth` namespace in the consumer's own locale JSON
(the same files loaded via `@locale-file`). If that namespace/key is
missing, it falls back to `error_messages/default_messages.en.ts`'s English
strings. Key names: `invalidEmail`, `userDisabled`, `invalidCredential`,
`emailAlreadyInUse`, `weakPassword`, `tooManyRequests`,
`networkRequestFailed`, `requiresRecentLogin`, `expiredActionCode`,
`invalidActionCode`, `userTokenExpired`, `unknown`.

## Middleware wiring

`middleware/update_session.ts`'s default export `updateSession(request,
rewriteUrl?, locale?)` is called from the consumer's own `middleware.ts`,
typically alongside (after) this package's existing `intlMiddleware`. It
sets/refreshes/clears `sessionCookieName`/`refreshTokenCookieName` cookies
and performs the guest/auth-page/signed-in redirect matrix — mirrors
`intlMiddleware`'s own rewrite/redirect/next() decision structure.

## Testing notes (filled in during Phase 3)

Not yet covered — see `docs/superpowers/specs/2026-08-01-phase2c-performance-design.md`.
Firebase itself (`firebase/app`, `firebase/auth`) must be mocked in tests;
no real Firebase project or network calls.
```

- [ ] **Step 2: Verify the file renders as valid markdown (no unclosed code fences)**

Run: `grep -c '```' docs/ai/firebase-auth.md`
Expected: an even number.

- [ ] **Step 3: Commit**

```bash
git add docs/ai/firebase-auth.md
git commit -m "docs: document the firebase_auth module in docs/ai"
```

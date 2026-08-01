# Phase 2b: Optional `firebase_auth` Submodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully optional, tree-shakeable `firebase_auth` submodule to `cloudflare-next-intl`, ported from `/Volumes/External/clarivant/CRV`'s hand-rolled Firebase auth layer, enabled via one boolean field in `setIntlConfig(...)` with **zero other code required** — no manual middleware call, no manual provider wiring.

**Architecture:** New `package/src/firebase_auth/**` tree with client/server/middleware/error-message subfolders. Nothing outside `firebase_auth/**` imports from it **statically** — the two auto-wire hook points (`intlMiddleware` in `src/config/middleware.ts`, `IntlProvider` in `src/server/components/server_provider.tsx`) reach into `firebase_auth/**` only via `await import(...)` (dynamic import), guarded by `config.firebaseAuth?.enabled`, so a consumer who never enables the module never triggers even a module-graph load of `firebase/app`/`firebase/auth`. Each unit also gets its own flat `package.json` exports subpath (manual-override / client-UI path), matching this repo's existing convention. Config flows through the existing `@intl-config` alias by extending `RoutingConfig` with an optional `firebaseAuth` field (including `autoWire?: boolean`, default `true`); every exported function no-ops when `config.firebaseAuth?.enabled` is not `true`. Auth error messages resolve through the package's existing `getTranslationsImpl` under a `firebaseAuth` namespace, falling back to bundled English defaults when the consumer hasn't added that namespace to their locale files.

**Tech Stack:** TypeScript, React 19, Next.js (peer deps, existing), `firebase` (NEW optional peer dependency — `firebase/app` + `firebase/auth` only).

## Global Constraints

- `firebase` is `peerDependenciesMeta.firebase.optional = true` — a consumer who never sets `firebaseAuth.enabled: true` must never have `firebase/app`/`firebase/auth` pulled into their bundle, even though they never write an explicit `firebaseAuth*` import themselves (auto-wiring means the package's OWN code is what would otherwise import it).
- No file outside `src/firebase_auth/**` may import from `src/firebase_auth/**` **statically**. The two auto-wire hook points (Tasks 13–14) are the sole exception, and they MUST use `await import(...)`, never a top-of-file `import`/`import type` for runtime values — a static import defeats tree-shaking for every consumer, since `middleware.ts` and `server_provider.tsx` are loaded unconditionally by anyone using `./middleware`/`./serverProvider`.
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
    /**
     * Default `true`: `intlMiddleware` and `IntlProvider` automatically wire
     * in session-refresh logic and the auth server provider — no other code
     * required beyond this config object. Set `false` to opt into manual
     * wiring instead (import `firebaseAuthMiddleware`/
     * `firebaseAuthServerProvider` yourself and call/render them explicitly).
     */
    autoWire?: boolean;
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
- Produces: the public subpath names every later task's source file must match exactly: `./firebaseAuthClient`, `./firebaseAuthClientProvider`, `./firebaseAuthServerProvider`, `./useFirebaseAuthUser` (conditional: `react-server` → server impl, `default` → client impl — mirrors the existing `./use` subpath's dual-environment pattern exactly, see Task 12), `./firebaseAuthActions`, `./firebaseAuthMiddleware`.

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

- [ ] **Step 3: Add the 6 new exports subpaths**

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
      "react-server": {
        "types": "./dist/src/firebase_auth/server/use_auth_user_server.d.ts",
        "import": "./dist/src/firebase_auth/server/use_auth_user_server.js"
      },
      "default": {
        "types": "./dist/src/firebase_auth/client/use_auth_user.d.ts",
        "import": "./dist/src/firebase_auth/client/use_auth_user.js"
      }
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

Note: unlike this package's own `./use` subpath, whose two implementations
(`use_functions.ts` vs `client_hooks.ts`) genuinely differ in *return
shape's data source* (promise-based `use()` vs. context), `useAuthUser`'s
server variant (Task 12) and client variant (Task 10) both simply return
`{ user, loading, ... }`-equivalent shapes reading from their own
respective per-environment state. Keeping them under ONE subpath (like
`./use`) rather than two separate ones (`./useFirebaseAuthUser` +
`./useFirebaseAuthUserServer`, as an earlier draft of this plan had it) is
what makes `useAuthUser` behave identically to `useLocale`/`useTranslations`
from the consumer's perspective: call it once, from a single import, and it
resolves to "the right one for wherever this code runs" automatically —
exactly the parity the user asked to double check here.

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
- Produces: `resolveAuthUserAndRedirect(): Promise<SerializedAuthUser | null>` — a plain async function (not a component) doing the resolve-user + authoritative-redirect logic, with NO opinion on where it's rendered relative to `LocaleContext`. This is consumed directly by Task 14's auto-wiring (which needs the redirect check to run BEFORE `LocationzationClientProvider` renders, but the client `AuthUserProvider` to render AFTER it — see Task 14's nesting explanation). Also produces default export `AuthUserServerProvider({ children })`, a thin convenience component wrapping `resolveAuthUserAndRedirect` + the client `AuthUserProvider`, kept for the manual-override path (`firebaseAuth.autoWire: false`) where a consumer renders it directly with no `LocaleContext`-ordering concern of their own to manage.

- [ ] **Step 1: Write the file**

Ported from CRV's `auth_user_server_provider.tsx`, split into a logic function + a thin wrapper component (rather than one component) so the redirect-check can be called independently of where the client provider renders — see Task 14. CRV reads `x-pathname` from a header set by its own middleware. This package's `intlMiddleware` doesn't set that header today — Task 13 adds it, as a small, generally-useful addition to `intlMiddleware` itself (not gated on `firebaseAuth`, since a locale-stripped current-path header is broadly useful and costs nothing extra to always set): `requestHeaders.set('x-pathname', pathWithoutLocale)` alongside the existing `Content-Language` header set. This file reads that same header via `next/headers`' `headers()`. Forward reference: Task 13 hasn't landed yet when this task runs — if `x-pathname` is absent (e.g. this function used standalone without `intlMiddleware`, or before Task 13 lands), it falls back to `'/'`, which is a safe (if imprecise) default — every path is treated as non-auth, non-whitelisted, so a guest visiting anywhere still gets redirected to `loginPath` correctly; only the "already on an auth page" and "whitelisted" exemptions are potentially mis-evaluated until the header exists.

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
 * Resolves the signed-in user from the session cookie and performs the
 * authoritative pre-render redirect (guest→login, signed-in→home on auth
 * pages) — middleware only checks cookie *presence*, not validity. Plain
 * async function, not a component: callers decide where/how to use the
 * resolved user relative to their own component tree (see
 * `AuthUserServerProvider` below for the simple case, and `IntlProvider`'s
 * auto-wiring for the case where ordering against `LocaleContext` matters).
 */
export async function resolveAuthUserAndRedirect(): Promise<SerializedAuthUser | null> {
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

    return currentUser && {
        uid: currentUser.uid,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        displayName: currentUser.displayName,
    };
}

/**
 * Convenience component for the manual-override path
 * (`firebaseAuth.autoWire: false`): resolves + redirects, then wraps
 * `children` in the client `AuthUserProvider` directly. NOT used by the
 * default auto-wiring path — `IntlProvider`/`LocationzationClientProvider`
 * call `resolveAuthUserAndRedirect` and the client `AuthUserProvider`
 * separately instead, so the client provider can render inside
 * `LocaleContext.Provider` rather than outside it.
 */
export default async function AuthUserServerProvider({ children }: {
    children: React.ReactNode;
}) {
    const initialUser = await resolveAuthUserAndRedirect();
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
- Produces: `sessionCookieName` (exported const, consumed by Tasks 6 and 7), `refreshTokenCookieName` (exported const), default export `updateSession(request, baseResponse, locale): Promise<NextResponse>` — **not** called manually by the consumer. Task 13 wires this into `intlMiddleware` itself via a dynamic import, so `intlMiddleware` remains the only middleware entry point a consumer's `middleware.ts` calls, exactly as today. `baseResponse` is whatever `intlMiddleware` already decided (its own `NextResponse.next()`/`.rewrite()`/`.redirect()` for locale routing) — this function must layer cookie set/clear onto that SAME response object for the pass-through case, and only construct a NEW response for the guest/auth-page redirect cases, so locale-routing headers/cookies from `baseResponse` are never silently dropped.

- [ ] **Step 1: Write the file**

Ported from CRV's `middleware_auth_util.ts`, adapted for response-composition (this signature differs from CRV's original, which built its own response from scratch — CRV's own middleware doesn't have a second locale-routing layer it must compose with). Generalizations: `AppVariables.defaultLocale`/`AppLinks`/`isAuthPath`/`whiteListLink`/`CookieKey` (all CRV-app-specific) become `config.locales[0]`-equivalent via the existing package's own `@intl-config`, and `config.firebaseAuth`'s fields. Deliberately Edge-safe: no `firebase/auth` import (same reasoning as CRV's original — Edge runtime cannot load `firebase/auth`'s Node-only deps).

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

/**
 * Layers Firebase session-cookie validation/refresh and auth redirects onto
 * an already-built middleware response. Called internally by `intlMiddleware`
 * (via dynamic import, see Task 13) when `config.firebaseAuth.enabled` is
 * true — not intended to be called directly unless `autoWire: false` is set.
 *
 * @param baseResponse The response `intlMiddleware` already produced for
 *   locale routing (its own next()/rewrite()/redirect()). On the
 *   pass-through path this function returns `baseResponse` itself (with
 *   cookies layered on) so locale-routing headers are never dropped; on the
 *   guest/auth-page redirect paths it returns a NEW response instead, since
 *   a redirect response can't also carry forward a rewrite/next decision.
 * @param locale The effective locale `intlMiddleware` resolved for this request.
 */
export default async function updateSession(
    request: NextRequest,
    baseResponse: NextResponse,
    locale: string,
): Promise<NextResponse> {
    const fa = config.firebaseAuth;
    if (!fa) return baseResponse;

    const rawPath = request.nextUrl.pathname;
    const requestPrefix = `/${locale}`;
    const path = rawPath === requestPrefix || rawPath.startsWith(`${requestPrefix}/`)
        ? rawPath.slice(requestPrefix.length) || '/'
        : rawPath;

    const lastSegment = rawPath.slice(rawPath.lastIndexOf('/') + 1);
    if (rawPath.startsWith('/_next') || /\.[a-zA-Z0-9]+$/.test(lastSegment)) {
        return baseResponse;
    }

    const localePrefix = locale === config.locales[0] ? '' : requestPrefix;
    const localeUrl = (target: string) =>
        new URL(`${localePrefix}${target === '/' ? '' : target}` || '/', request.url);

    const isWhiteListed = fa.whiteListPaths?.includes(path) ?? false;
    if (isWhiteListed) return baseResponse;

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
        response = isAuthPage ? baseResponse : NextResponse.redirect(localeUrl(fa.loginPath));
    } else if (isAuthPage) {
        response = NextResponse.redirect(localeUrl(fa.homePath));
    } else {
        response = baseResponse;
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
- Produces: default export `useAuthUser(): Promise<{ user: User | null; loading: false }>` (server variant) — deliberately the SAME return shape's key names (`user`/`loading`) as the client `useAuthUser()` from Task 10, just wrapped in a `Promise` instead of read synchronously from context. This mirrors this package's own existing async/sync split for `getLocale()` (server, async) vs. `useLocale()` (client, sync context read) — same underlying concept, same field names, different calling convention per environment. An agent that has learned the client shape (`{ user, loading }`) can correctly predict the server shape by analogy (`await` it, same field names) instead of needing to learn an unrelated `Promise<User | null>` shape.

- [ ] **Step 1: Write the server hook**

Create `package/src/firebase_auth/server/use_auth_user_server.ts`:

```ts
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
 * exposes (loading is always `false` here — server resolution is
 * synchronous with respect to the awaited call), so code reading
 * `const { user } = await useAuthUser()` generalizes correctly from
 * `const { user } = useAuthUser()` on the client side.
 */
export default async function useAuthUser(): Promise<{ user: User | null; loading: false }> {
    const { currentUser } = await getAuthenticatedAppForUser();
    return { user: currentUser, loading: false };
}
```

- [ ] **Step 2: Write the barrel**

Create `package/src/firebase_auth/index.ts`:

```ts
export { default as FirebaseAuthClientProvider } from './client/auth_user_provider';
export { default as FirebaseAuthServerProvider } from './server/auth_user_server_provider';
// NOTE: no single `useFirebaseAuthUser` re-export here — the barrel is a
// plain module graph with no bundler-conditional resolution, so it cannot
// replicate the react-server/default split package.json's exports map
// provides for the ./useFirebaseAuthUser subpath. A consumer wanting the
// hook imports `cloudflare-next-intl/useFirebaseAuthUser` directly (which
// DOES resolve correctly per-environment) rather than through this barrel.
// This barrel re-exports the client and server hook under distinct names
// instead, for consumers who explicitly know which one they want:
export { default as useFirebaseAuthUserClient } from './client/use_auth_user';
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
function checkEntry(key, val) {
  if ('import' in val) {
    if (!fs.existsSync(val.import)) { console.error('MISSING:', key, val.import); process.exit(1); }
    return;
  }
  // Conditional export (e.g. react-server/default) — check every branch.
  for (const [cond, branch] of Object.entries(val)) {
    checkEntry(\`\${key} (\${cond})\`, branch);
  }
}
for (const [key, val] of Object.entries(pkg.exports)) {
  if (!key.startsWith('./firebaseAuth')) continue;
  checkEntry(key, val);
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

### Task 13: Auto-wire session refresh into `intlMiddleware`

**Files:**
- Modify: `package/src/config/middleware.ts`

**Interfaces:**
- Consumes: `updateSession` default export from Task 11 (`../firebase_auth/middleware/update_session`), via **dynamic import only**.
- Produces: `intlMiddleware`'s behavior is unchanged for any consumer without `config.firebaseAuth?.enabled` set; for consumers with it enabled, the returned response also carries Firebase session cookie validation/refresh and guest/auth-page redirects, with zero additional call in the consumer's own `middleware.ts`. Also adds an `x-pathname` request header (locale-stripped current path) consumed by Task 8's `AuthUserServerProvider`.

- [ ] **Step 1: Add the locale-stripped `x-pathname` header**

In `package/src/config/middleware.ts`, find where `response.headers.set('Content-Language', effectiveLocaleForRequest);` is set near the end of `intlMiddleware` (currently the last statement before `return response;` in the try block). Just before it, add:

```ts
        response.headers.set('x-pathname', pathWithoutLocale);
```

This is a small, independently useful addition (not firebase_auth-specific) — a locale-stripped current-path header costs nothing extra to always set and Task 8's server provider already expects it.

- [ ] **Step 2: Add the firebase_auth auto-wire call**

Immediately after the `x-pathname` header line (and after the existing cookie-setting block), and still before `return response;`, add:

```ts
        if (config.firebaseAuth?.enabled && config.firebaseAuth.autoWire !== false) {
            const { default: updateFirebaseAuthSession } = await import('../firebase_auth/middleware/update_session');
            response = await updateFirebaseAuthSession(request, response, effectiveLocaleForRequest);
        }
```

Note the dynamic `await import(...)` — this MUST NOT become a static top-of-file import. A consumer who never sets `firebaseAuth.enabled` must never have this module graph (and therefore `firebase/app`/`firebase/auth`, transitively via `firebase_server.ts`/`auth_user_provider.tsx`) loaded, even though `middleware.ts` itself is unconditionally imported by every consumer via `./middleware`.

- [ ] **Step 3: Verify placement — the call must be inside the existing try block, after cookies/headers are finalized**

Re-read the full function after editing to confirm: the firebase_auth call happens after `response` is fully finalized by locale routing (rewrite/redirect/next decided, locale cookie set, bot cookie set, `Content-Language` set) but still inside the same `try` — so a thrown error inside `updateFirebaseAuthSession` is caught by `intlMiddleware`'s existing catch-all and falls back to `NextResponse.next()`, same safety guarantee the rest of the function already has.

- [ ] **Step 4: Typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify the disabled path is unaffected**

Run: `cd package && npx vitest run src/config/middleware.test.ts`
Expected: Phase 1's existing `middleware.test.ts` suite (which uses the fixture config with no `firebaseAuth` field) still passes unmodified — proves the new block is a true no-op when disabled.

- [ ] **Step 6: Commit**

```bash
git add package/src/config/middleware.ts
git commit -m "feat(firebase_auth): auto-wire session refresh into intlMiddleware via dynamic import"
```

---

### Task 14: Auto-wire Firebase auth into `IntlProvider` and its client provider

**Why this needs care:** `AuthUserProvider` (Task 6, client) calls this package's own `usePathname()`/`useLocale()`-equivalent, which read from `LocaleContext` — established by `LocationzationClientProvider` (`client/components/client_provider.tsx`). If the server-side redirect-check component (`AuthUserServerProvider`, Task 8) wrapped OUTSIDE `LocationzationClientProvider` the way a naive "wrap IntlProvider's children" approach suggests, `AuthUserProvider` would render before `LocaleContext` exists and crash (Task 6's hooks throw a descriptive error when rendered outside the provider, by design — see `.agent/.sub-rules/packages/server-client-split.md`). The nesting must instead be: `IntlProvider` performs the redirect CHECK itself (a plain function call, not a wrapping component), then renders `LocationzationClientProvider` → `AuthUserProvider` → `children`, in that order. Two files change, not one.

**Files:**
- Modify: `package/src/server/components/server_provider.tsx` — inline the server-side auth redirect check (the logic Task 8's `AuthUserServerProvider` contains) directly into `IntlProvider`, dynamically imported. `AuthUserServerProvider` itself (from Task 8) remains as its own standalone exported component for the manual-override path (`firebaseAuth.autoWire: false`), but auto-wiring does NOT render it as a wrapping component — it calls the same underlying user-resolution + redirect logic inline, then separately passes the resolved `initialUser` down to `LocationzationClientProvider`.
- Modify: `package/src/client/components/client_provider.tsx` — conditionally wraps its own children in the client `AuthUserProvider` (Task 6), dynamically imported, AFTER establishing `LocaleContext`.

**Interfaces:**
- Consumes: `getAuthenticatedAppForUser` from Task 7 and the redirect logic pattern from Task 8, both via dynamic import from `server_provider.tsx`. `AuthUserProvider` default export from Task 6, via dynamic import from `client_provider.tsx`.
- Produces: `IntlProvider`'s and `LocationzationClientProvider`'s rendered output is unchanged for any consumer without `config.firebaseAuth?.enabled`; for consumers with it enabled, the full auth flow (server redirect check + client session sync) is wired automatically through both the server and client provider, in the correct nesting order, with zero consumer code beyond the config flag.

- [ ] **Step 1: Wire the server-side check into `IntlProvider`**

Task 8 already produces `resolveAuthUserAndRedirect` as a standalone exported function (kept separate from the `AuthUserServerProvider` component precisely so this task can call it without going through a wrapping component) — no refactor needed here, just the wiring below.

In `package/src/server/components/server_provider.tsx`, inside `LocationzationProvider` (before its final `return`, after `messagesValue` is resolved), add:

```tsx
    let initialAuthUser: SerializedAuthUser | null = null;
    if (config.firebaseAuth?.enabled && config.firebaseAuth.autoWire !== false) {
        const { resolveAuthUserAndRedirect } = await import('../../firebase_auth/server/auth_user_server_provider');
        initialAuthUser = await resolveAuthUserAndRedirect();
    }
```

Add `import config from '../../config/intl_config';` and `import type { SerializedAuthUser } from '../../firebase_auth/types';` at the top (the type-only import is erased at compile time and does not affect tree-shaking/bundle size — only runtime imports of `firebase_auth/**` need to stay dynamic).

Then pass `initialAuthUser` down as a new, optional prop on `LocationzationClientProvider`:

```tsx
    return <LocationzationClientProvider language={language} messages={messagesValue} initialAuthUser={initialAuthUser}>
        {children}
    </LocationzationClientProvider>
```

- [ ] **Step 2: Wire the client-side provider into `LocationzationClientProvider`**

In `package/src/client/components/client_provider.tsx`, add the new prop and the conditional client `AuthUserProvider` wrap:

```tsx
import dynamic from 'next/dynamic';
import config from '@intl-config';
import type { SerializedAuthUser } from '../../firebase_auth/types';
```

Update the component's props type to add `initialAuthUser?: SerializedAuthUser | null;`, then change the body:

```tsx
export default function LocationzationClientProvider({
    language,
    messages,
    initialAuthUser = null,
    children
}: {
    language: string;
    messages: TranslationObject;
    initialAuthUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): Component {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);

    let providedChildren = children;
    if (config.firebaseAuth?.enabled && config.firebaseAuth.autoWire !== false) {
        const AuthUserProvider = dynamic(() => import('../../firebase_auth/client/auth_user_provider'));
        providedChildren = <AuthUserProvider initialUser={initialAuthUser}>{children}</AuthUserProvider>;
    }

    return <LocaleContext.Provider value={{ language, messages }}>
        {providedChildren}
    </LocaleContext.Provider>;
}
```

`LocaleContext.Provider` remains the outermost element inside this component — `AuthUserProvider` (and therefore its own descendants calling `usePathname()`/`useLocale()`) renders as a CHILD of `LocaleContext.Provider`, so the context is already established by the time it mounts. This resolves the ordering hazard described above.

Both dynamic imports (Step 1's and Step 2's) MUST stay dynamic, never static — `server_provider.tsx` and `client_provider.tsx` are loaded by every consumer using `./serverProvider`, regardless of auth usage.

- [ ] **Step 3: Typecheck**

Run: `cd package && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the disabled path is unaffected on both files**

Run: `cd package && npx vitest run src/server/components/server_provider.test.tsx src/client/components/client_provider.test.tsx`
Expected: Phase 1's existing suites (fixture config has no `firebaseAuth`) still pass unmodified — proves both new blocks are true no-ops when disabled.

- [ ] **Step 5: Commit**

```bash
git add package/src/server/components/server_provider.tsx package/src/client/components/client_provider.tsx package/src/firebase_auth/server/auth_user_server_provider.tsx
git commit -m "feat(firebase_auth): auto-wire auth into IntlProvider and its client provider, correctly nested inside LocaleContext"
```

---

### Task 15: Document the module in `.agent/.sub-rules/packages/`

**Files:**
- Create: `.agent/.sub-rules/packages/firebase-auth.md`
- Modify: `.agent/.sub-rules/packages.md` (add the index entry)

**Interfaces:**
- Consumes: nothing code-facing; documents the module built in Tasks 1–14, including the auto-wiring mechanism.

- [ ] **Step 1: Write the topic file**

Create `.agent/.sub-rules/packages/firebase-auth.md`:

```markdown
# Firebase Auth Module — `package/src/firebase_auth/**`

Sibling files: [structure.md](structure.md), [config-and-routing.md](config-and-routing.md),
[nextjs.md](nextjs.md)'s "Cookies & session state (Edge-safe)" section.

Optional, tree-shakeable submodule. Ported from `/Volumes/External/clarivant/CRV`'s
hand-rolled Firebase auth layer during Phase 2b.

## Enabling it — zero other code required

Add to the config object passed to `setIntlConfig`:

```ts
firebaseAuth: {
  enabled: true,
  loginPath: "/login",
  homePath: "/",
  isAuthPath: (p) => p === "/login" || p === "/signup",
}
```

That's the entire integration. The consumer's `middleware.ts` still just
calls `intlMiddleware` (unchanged); the root layout still just wraps
children in `IntlProvider` (unchanged). Both internally detect
`config.firebaseAuth.enabled` and auto-wire session refresh / the auth
server provider via a dynamic import — see "Auto-wiring mechanism" below.
If `firebaseAuth` is omitted or `enabled` is not `true`, every exported
function in this module is a documented no-op and the `firebase` peer
dependency is never touched.

Client-side pieces (`useAuthUser`, the login/signup form actions) are NOT
auto-injected anywhere — the package has no way to know where a consumer
wants login UI to render. These remain explicit imports the consumer writes
in their own components (e.g. `cloudflare-next-intl/useFirebaseAuthUser` in
a navbar). "Zero-code" means "auth mechanics work the instant the flag is
on" (redirects, session persistence, token refresh), not "UI is invented
for you."

## Auto-wiring mechanism

- `intlMiddleware` (`src/config/middleware.ts`), after finishing its own
  locale-routing response, does `await import('../firebase_auth/middleware/update_session')`
  and layers Firebase session validation/refresh/redirects onto that SAME
  response object when `config.firebaseAuth?.enabled && autoWire !== false`.
- `IntlProvider` (`src/server/components/server_provider.tsx`), when the
  same condition holds, wraps its children in a dynamically-imported
  `AuthUserServerProvider` before handing off to its own existing client
  provider.
- Both imports are **dynamic, never static** — this is load-bearing for
  tree-shaking. `middleware.ts` and `server_provider.tsx` are loaded by
  every consumer regardless of auth usage; a static import of anything
  under `firebase_auth/**` (which transitively imports `firebase/app`/
  `firebase/auth`) would defeat the "zero cost when unused" goal even for
  consumers who never set `firebaseAuth.enabled`.
- Set `firebaseAuth.autoWire: false` to opt OUT of both hooks and wire
  `cloudflare-next-intl/firebaseAuthMiddleware` /
  `cloudflare-next-intl/firebaseAuthServerProvider` manually instead —
  the escape hatch for consumers needing explicit control over ordering
  or placement.

## Isolation rules (do not violate)

- Nothing outside `src/firebase_auth/**` imports from it **statically** —
  the two auto-wire hook points above are the sole, dynamic-import-only
  exception.
- Nothing inside `src/firebase_auth/**` imports from `src/general/**`,
  `src/config/**`, `src/client/**`, `src/server/**` — with ONE sanctioned
  exception: `error_messages/firebase_auth_error_helper.ts` imports
  `getTranslationsImpl`/`getMessageCache` from `src/general/**` to reuse this
  package's existing translation resolution for localized error messages.
- Each unit has its own flat `package.json` exports subpath
  (`./firebaseAuthClientProvider`, etc.) for the manual-override path and
  the client-UI pieces — none of them are wired into the top-level
  `.`/`./client`/`./server` barrels.

## Localization

Error messages resolve through `firebaseAuthErrorMessage(locale, error)`,
which looks up a `firebaseAuth` namespace in the consumer's own locale JSON
(the same files loaded via `@locale-file`). If that namespace/key is
missing, it falls back to `error_messages/default_messages.en.ts`'s English
strings. Key names: `invalidEmail`, `userDisabled`, `invalidCredential`,
`emailAlreadyInUse`, `weakPassword`, `tooManyRequests`,
`networkRequestFailed`, `requiresRecentLogin`, `expiredActionCode`,
`invalidActionCode`, `userTokenExpired`, `unknown`.

## Testing notes (filled in during Phase 2c)

Not yet covered — see `docs/superpowers/plans/2026-08-01-phase2c-performance.md`.
Firebase itself (`firebase/app`, `firebase/auth`) must be mocked in tests;
no real Firebase project or network calls.
```

- [ ] **Step 2: Add the index entry**

Edit `.agent/.sub-rules/packages.md`, adding this bullet to the "Per-topic files" list (after the `testing.md` bullet):

```markdown
- [packages/firebase-auth.md](packages/firebase-auth.md) — optional
  `firebase_auth` submodule: auto-wiring mechanism, isolation rules,
  localization.
```

- [ ] **Step 3: Verify the file renders as valid markdown (no unclosed code fences)**

Run: `grep -c '```' .agent/.sub-rules/packages/firebase-auth.md`
Expected: an even number.

- [ ] **Step 4: Commit**

```bash
git add .agent/.sub-rules/packages/firebase-auth.md .agent/.sub-rules/packages.md
git commit -m "docs: document the firebase_auth module and its auto-wiring mechanism"
```

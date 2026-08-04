# Auth Lifecycle Callbacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three optional `firebaseAuth` config callbacks — `onSignIn`, `onEmailVerified`, `onSignOut` — that `AuthUserProvider` invokes exactly once per real auth-lifecycle transition, so consumer apps can hook cleanup/side-effect logic (e.g. clearing per-account `localStorage` state) without re-deriving the transition from raw SDK callbacks.

**Architecture:** Three new optional fields on `FirebaseAuthRoutingConfig` (`package/src/types/types.ts`). All three are read and invoked entirely inside `AuthUserProvider` (`package/src/firebase_auth/client/auth_user_provider.tsx`), reusing state it already tracks (`syncedSignedIn`, `confirmedSignedOut`) plus one new ref for the email-verified transition. Each call site wraps the callback in a try/catch that logs and swallows failures — a broken consumer callback never blocks cookie sync, state updates, or navigation.

**Tech Stack:** TypeScript, React (hooks), Vitest + Testing Library (existing test file's mocking pattern).

## Global Constraints

- No server-side (`update_session.ts`) changes — this feature is entirely client-side, per the spec's Non-goals.
- No new components, no new provider props — the three fields live directly on the existing `firebaseAuth` config object.
- `onSignIn`/`onEmailVerified` receive the real `firebase/auth` `User` object; `onSignOut` receives no arguments.
- Each callback may be sync or return a `Promise`; the call site always `await`s it inside try/catch, logging via `console.error` on failure (matching the existing pattern for `writeSession`/`clearSession` failures in this file).
- `onSignIn` fires once on the `null → user` transition only — never on a plain token refresh of an already-signed-in user.
- `onSignOut` fires once when `confirmedSignedOut` transitions to `true` (i.e. inside the existing double-null-confirmation logic), not on the first, possibly-transient, null callback.
- `onEmailVerified` fires once on the `false → true` edge of `user.emailVerified`, checked from both places that can first observe it: the `onIdTokenChanged` listener and `reloadUser()`. It must not refire on a later observation of an already-verified user through either path.
- Every task ends with a local commit **except**: per explicit instruction from the user for this session, do NOT commit or push any of this work. Skip the "Commit" step in every task below; leave changes staged/unstaged in the working tree for the user to review and commit themselves.

---

### Task 1: Add the three callback fields to `FirebaseAuthRoutingConfig`

**Files:**
- Modify: `package/src/types/types.ts:418-473` (the `FirebaseAuthRoutingConfig` interface)

**Interfaces:**
- Produces: `FirebaseAuthRoutingConfig.onSignIn?: (user: import('firebase/auth').User) => void | Promise<void>`, `.onEmailVerified?: (user: import('firebase/auth').User) => void | Promise<void>`, `.onSignOut?: () => void | Promise<void>` — consumed by Task 2.

- [ ] **Step 1: Add a top-of-file type-only import for `User`**

  In `package/src/types/types.ts`, add near the existing top-of-file imports (after the last `import type` line, currently ending at line 6):
  ```ts
  import type { User } from 'firebase/auth';
  ```

- [ ] **Step 2: Add the three fields to `FirebaseAuthRoutingConfig`**

  Immediately after the existing `emailVerifiedHintCookieName?: string;` field (the last field before the interface's closing `}`, currently at line 472), add:
  ```ts
      /**
       * Called once, the moment `AuthUserProvider` observes a real sign-in
       * (a `null → user` transition) — never on a plain token refresh of an
       * already-signed-in user. Runs after the session/refresh-token/
       * email-verified-hint cookies have already been written for this
       * user, so cookie state is in sync when this fires. A throw/rejection
       * is caught and logged via `console.error`; it never blocks cookie
       * sync or navigation.
       */
      onSignIn?: (user: User) => void | Promise<void>;
      /**
       * Called once, on the `false → true` transition of `user.emailVerified`
       * — never on a later observation of an already-verified user. Checked
       * from both `AuthUserProvider`'s `onIdTokenChanged` listener and its
       * `reloadUser()`, since either can be the first to observe the
       * transition. A throw/rejection is caught and logged via
       * `console.error`.
       */
      onEmailVerified?: (user: User) => void | Promise<void>;
      /**
       * Called once, when sign-out is confirmed — after `AuthUserProvider`'s
       * existing debounce for transient SDK null-callbacks (two consecutive
       * `onIdTokenChanged(null)` calls), not on the first, possibly
       * transient, null. Runs after the session/refresh-token cookies have
       * already been cleared. A throw/rejection is caught and logged via
       * `console.error`.
       */
      onSignOut?: () => void | Promise<void>;
  ```

- [ ] **Step 3: Type-check**

  Run: `cd package && npx tsc --noEmit`
  Expected: `TypeScript: No errors found` (no other file references these fields yet, so nothing should break or need them).

---

### Task 2: Fire `onSignIn` and `onSignOut` from `AuthUserProvider`

**Files:**
- Modify: `package/src/firebase_auth/client/auth_user_provider.tsx:182-217` (the `onIdTokenChanged` listener inside the second `useEffect`)
- Modify: `package/src/firebase_auth/client/auth_user_provider.test.tsx` (add tests)

**Interfaces:**
- Consumes: `fa.onSignIn`, `fa.onSignOut` from `FirebaseAuthRoutingConfig` (Task 1). `fa` is already in scope in `AuthUserProvider` as `const fa = config.firebaseAuth;` (line 118).
- Produces: no new exports — purely internal wiring inside the existing `onIdTokenChanged` callback.

- [ ] **Step 1: Write the failing tests**

  Add to `package/src/firebase_auth/client/auth_user_provider.test.tsx`, after the existing `it('redirects to redirectAuthPath once confirmed signed-out (two consecutive nulls)', ...)` test (which ends around line 181):

  ```ts
  it('calls onSignIn exactly once on a real sign-in, not on a subsequent token refresh of the same user', async () => {
      const onSignIn = vi.fn();
      currentConfig.firebaseAuth!.onSignIn = onSignIn;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();
      const user = makeUser();
      await act(async () => { idTokenListener?.(user); });
      await flush();
      expect(onSignIn).toHaveBeenCalledTimes(1);
      expect(onSignIn).toHaveBeenCalledWith(user);

      // A subsequent callback for the SAME signed-in user (e.g. a routine
      // token refresh) must not refire onSignIn.
      await act(async () => { idTokenListener?.(user); });
      await flush();
      expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('does not call onSignIn when signed out (null callback)', async () => {
      const onSignIn = vi.fn();
      currentConfig.firebaseAuth!.onSignIn = onSignIn;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();
      await act(async () => { idTokenListener?.(null); });
      await flush();
      expect(onSignIn).not.toHaveBeenCalled();
  });

  it('logs and swallows an onSignIn callback that throws, without blocking cookie sync', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const onSignIn = vi.fn(() => { throw new Error('boom'); });
      currentConfig.firebaseAuth!.onSignIn = onSignIn;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();
      const user = makeUser();
      await act(async () => { idTokenListener?.(user); });
      await flush();
      expect(onSignIn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onSignIn callback failed', expect.any(Error));
      expect(document.cookie).toContain('__fa_session__=id-token');
  });

  it('calls onSignOut exactly once after sign-out is confirmed (two consecutive nulls), not on the first null', async () => {
      const onSignOut = vi.fn();
      currentConfig.firebaseAuth!.onSignOut = onSignOut;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={makeUser()}><span>child</span></AuthUserProvider>);
      await flush();
      await act(async () => { idTokenListener?.(null); });
      await flush();
      expect(onSignOut).not.toHaveBeenCalled();
      await act(async () => { idTokenListener?.(null); });
      await flush();
      expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('calls onSignOut immediately on a single null when initialUser was already null (server-confirmed signed-out)', async () => {
      const onSignOut = vi.fn();
      currentConfig.firebaseAuth!.onSignOut = onSignOut;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();
      await act(async () => { idTokenListener?.(null); });
      await flush();
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(onSignOut).toHaveBeenCalledWith();
  });

  it('logs and swallows an onSignOut callback that throws, without blocking the redirect', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const onSignOut = vi.fn(() => { throw new Error('boom'); });
      currentConfig.firebaseAuth!.onSignOut = onSignOut;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();
      await act(async () => { idTokenListener?.(null); });
      await flush();
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onSignOut callback failed', expect.any(Error));
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd package && npx vitest run src/firebase_auth/client/auth_user_provider.test.tsx -t "onSignIn"`
  Expected: FAIL — `onSignIn`/`onSignOut` are not called at all yet (the config fields exist per Task 1, but nothing reads them).

- [ ] **Step 3: Implement `onSignIn` and `onSignOut` in the `onIdTokenChanged` listener**

  In `package/src/firebase_auth/client/auth_user_provider.tsx`, inside the `onIdTokenChanged` callback (currently lines 182-217), the relevant existing code is:
  ```ts
              unsubscribe = onIdTokenChanged(auth, async (user) => {
                  const isSignedIn = !!user;
                  const previous = syncedSignedIn.current;

                  try {
                      if (user) {
                          await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName);
                      } else {
                          await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, refreshTokenMaxAge);
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
  ```

  Replace it with (adds `onSignIn` right after `syncedSignedIn.current = isSignedIn;` when this is a real `null → user` transition, and `onSignOut` right where `consecutiveNulls.current >= 2` first becomes true):
  ```ts
              unsubscribe = onIdTokenChanged(auth, async (user) => {
                  const isSignedIn = !!user;
                  const previous = syncedSignedIn.current;
                  const isRealSignIn = isSignedIn && previous === false;

                  try {
                      if (user) {
                          await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName);
                      } else {
                          await clearSession(sessionCookieName, refreshTokenCookieName, emailVerifiedHintCookieName, refreshTokenMaxAge);
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
                      if (consecutiveNulls.current === 2) {
                          setConfirmedSignedOut(true);
                          try {
                              await fa.onSignOut?.();
                          } catch (e) {
                              console.error('AuthUserProvider: onSignOut callback failed', e);
                          }
                      }
                  }

                  if (isRealSignIn && user) {
                      try {
                          await fa.onSignIn?.(user);
                      } catch (e) {
                          console.error('AuthUserProvider: onSignIn callback failed', e);
                      }
                  }

                  const flipped = previous !== undefined && previous !== isSignedIn;
                  const contradictsPage = previous === undefined && isSignedIn === isAuthPage;

                  if (flipped || contradictsPage) {
                      router.refresh();
                  }
              });
  ```

  Note on the `consecutiveNulls.current === 2` change (from `>= 2`): this is required so `onSignOut` fires exactly once, not on every subsequent null callback after the second one (the counter keeps incrementing past 2 on later nulls, so `>= 2` would refire the callback every time).

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd package && npx vitest run src/firebase_auth/client/auth_user_provider.test.tsx`
  Expected: All tests pass, including the 6 new ones from Step 1 and all pre-existing tests in this file (the `consecutiveNulls` condition change from `>=` to `===` must not break the existing `redirects to redirectAuthPath once confirmed signed-out (two consecutive nulls)` test — verify this specifically).

- [ ] **Step 5: Type-check**

  Run: `cd package && npx tsc --noEmit`
  Expected: `TypeScript: No errors found`

---

### Task 3: Fire `onEmailVerified` from both `onIdTokenChanged` and `reloadUser`

**Files:**
- Modify: `package/src/firebase_auth/client/auth_user_provider.tsx` (add a new ref, and two call sites)
- Modify: `package/src/firebase_auth/client/auth_user_provider.test.tsx` (add tests)

**Interfaces:**
- Consumes: `fa.onEmailVerified` from `FirebaseAuthRoutingConfig` (Task 1). The `onIdTokenChanged` listener modified in Task 2.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

  Add to `package/src/firebase_auth/client/auth_user_provider.test.tsx`, after the `onSignOut` tests added in Task 2:

  ```ts
  it('calls onEmailVerified exactly once on the false→true transition via onIdTokenChanged, not again on a later observation', async () => {
      const onEmailVerified = vi.fn();
      currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
      currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();

      const unverifiedUser = makeUser({ emailVerified: false });
      await act(async () => { idTokenListener?.(unverifiedUser); });
      await flush();
      expect(onEmailVerified).not.toHaveBeenCalled();

      const verifiedUser = makeUser({ emailVerified: true });
      await act(async () => { idTokenListener?.(verifiedUser); });
      await flush();
      expect(onEmailVerified).toHaveBeenCalledTimes(1);
      expect(onEmailVerified).toHaveBeenCalledWith(verifiedUser);

      // Observed again (e.g. a later token refresh) — must not refire.
      await act(async () => { idTokenListener?.(verifiedUser); });
      await flush();
      expect(onEmailVerified).toHaveBeenCalledTimes(1);
  });

  it('does not call onEmailVerified when the initial user is already verified (no prior unverified observation)', async () => {
      const onEmailVerified = vi.fn();
      currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={{ uid: 'x', email: null, emailVerified: true, displayName: null }}>
          <span>child</span>
      </AuthUserProvider>);
      await flush();
      const verifiedUser = makeUser({ emailVerified: true });
      await act(async () => { idTokenListener?.(verifiedUser); });
      await flush();
      expect(onEmailVerified).not.toHaveBeenCalled();
  });

  it('calls onEmailVerified exactly once via reloadUser’s false→true transition', async () => {
      const onEmailVerified = vi.fn();
      currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
      const unverifiedUser = makeUser({ emailVerified: false });
      authObj.currentUser = unverifiedUser;
      let ctxValue: import('./auth_user_provider').AuthUserContextType | undefined;
      const { default: AuthUserProvider, AuthUserContext } = await import('./auth_user_provider');
      function Consumer() {
          ctxValue = useContext(AuthUserContext);
          return null;
      }
      render(<AuthUserProvider initialUser={null}><Consumer /></AuthUserProvider>);
      await flush();
      await act(async () => { idTokenListener?.(unverifiedUser); });
      await flush();
      expect(onEmailVerified).not.toHaveBeenCalled();

      authObj.currentUser = makeUser({ uid: 'u1', emailVerified: true });
      await act(async () => { await ctxValue?.reloadUser(); });
      expect(onEmailVerified).toHaveBeenCalledTimes(1);

      // A second reloadUser() while still verified must not refire.
      await act(async () => { await ctxValue?.reloadUser(); });
      expect(onEmailVerified).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows an onEmailVerified callback that throws, without blocking cookie sync', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const onEmailVerified = vi.fn(() => { throw new Error('boom'); });
      currentConfig.firebaseAuth!.onEmailVerified = onEmailVerified;
      const { default: AuthUserProvider } = await import('./auth_user_provider');
      render(<AuthUserProvider initialUser={null}><span>child</span></AuthUserProvider>);
      await flush();
      await act(async () => { idTokenListener?.(makeUser({ emailVerified: false })); });
      await flush();
      await act(async () => { idTokenListener?.(makeUser({ emailVerified: true })); });
      await flush();
      expect(onEmailVerified).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('AuthUserProvider: onEmailVerified callback failed', expect.any(Error));
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd package && npx vitest run src/firebase_auth/client/auth_user_provider.test.tsx -t "onEmailVerified"`
  Expected: FAIL — `onEmailVerified` is never called yet.

- [ ] **Step 3: Add the tracking ref**

  In `package/src/firebase_auth/client/auth_user_provider.tsx`, immediately after the existing:
  ```ts
      const consecutiveNulls = useRef(0);
      const [confirmedSignedOut, setConfirmedSignedOut] = useState(initialUser === null);
  ```
  add:
  ```ts
      // Tracks the last-observed `emailVerified` value so `onEmailVerified`
      // fires exactly once on the false→true edge, not on every later
      // observation of an already-verified user (both `onIdTokenChanged` and
      // `reloadUser` can be the first to observe the transition).
      const emailVerifiedRef = useRef(initialUser?.emailVerified ?? false);
  ```

- [ ] **Step 4: Fire `onEmailVerified` from the `onIdTokenChanged` listener**

  In the same `onIdTokenChanged` callback modified in Task 2, immediately after the `if (isRealSignIn && user) { ... }` block added in that task, add:
  ```ts
                  if (user && !emailVerifiedRef.current && user.emailVerified) {
                      emailVerifiedRef.current = true;
                      try {
                          await fa.onEmailVerified?.(user);
                      } catch (e) {
                          console.error('AuthUserProvider: onEmailVerified callback failed', e);
                      }
                  } else if (user) {
                      emailVerifiedRef.current = user.emailVerified;
                  }
  ```
  Placing this after the `isRealSignIn` block (not inside it) is required — the transition must be checked on every callback where `user` is truthy, not only on a real sign-in, since a user can flip from unverified to verified while already signed in (the exact CRV scenario: verified via an emailed link while still on the same session).

- [ ] **Step 5: Fire `onEmailVerified` from `reloadUser`**

  In `package/src/firebase_auth/client/auth_user_provider.tsx`, the `reloadUser` callback currently ends with:
  ```ts
              await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, confirmedToken);
              setAuthUserCache(user);
              setState({ user, loading: false });
          } catch (e) {
              console.error('AuthUserProvider: reloadUser failed', e);
          }
      }, []);
  ```
  Insert the same transition check between the `writeSession` call and `setAuthUserCache`:
  ```ts
              await writeSession(user, sessionCookieName, maxAge, refreshTokenCookieName, refreshTokenMaxAge, emailVerifiedHintCookieName, confirmedToken);

              if (!emailVerifiedRef.current && user.emailVerified) {
                  emailVerifiedRef.current = true;
                  try {
                      await fa.onEmailVerified?.(user);
                  } catch (e) {
                      console.error('AuthUserProvider: onEmailVerified callback failed', e);
                  }
              } else {
                  emailVerifiedRef.current = user.emailVerified;
              }

              setAuthUserCache(user);
              setState({ user, loading: false });
          } catch (e) {
              console.error('AuthUserProvider: reloadUser failed', e);
          }
      }, []);
  ```

- [ ] **Step 6: Run the tests to verify they pass**

  Run: `cd package && npx vitest run src/firebase_auth/client/auth_user_provider.test.tsx`
  Expected: All tests pass, including the 5 new ones from Step 1 and every pre-existing test in this file.

- [ ] **Step 7: Type-check**

  Run: `cd package && npx tsc --noEmit`
  Expected: `TypeScript: No errors found`

---

### Task 4: Full-suite verification and docs

**Files:**
- Modify: `package/src/firebase_auth/README.md` (document the new callbacks)
- Modify: `package/CHANGELOG.md` (new entry)
- Modify: `package/package.json` (version bump)

**Interfaces:**
- No new interfaces — this task only verifies the whole package still passes and documents what Tasks 1-3 built.

- [ ] **Step 1: Run the full package test suite**

  Run: `cd package && npx vitest run`
  Expected: All test files pass (467+ tests from before this plan, plus the 11 new tests added across Tasks 2-3).

- [ ] **Step 2: Run the full type-check one more time**

  Run: `cd package && npx tsc --noEmit`
  Expected: `TypeScript: No errors found`

- [ ] **Step 3: Update `package/src/firebase_auth/README.md`**

  Find the `## Layout` section's bullet describing `auth_user_provider.tsx` (currently: `` `auth_user_provider.tsx` (context provider, syncs session cookie) ``). Replace it with:
  ```
  `auth_user_provider.tsx` (context provider, syncs session cookie, and
    invokes the optional `onSignIn`/`onEmailVerified`/`onSignOut`
    `firebaseAuth` config callbacks exactly once per real transition — see
    their doc comments on `FirebaseAuthRoutingConfig` in `types/types.ts`),
  ```

- [ ] **Step 4: Read the current package version**

  Run: `grep -n '"version"' package/package.json`
  Note the current value (e.g. `"0.6.14"`) — the next step bumps the PATCH version by one from whatever this shows. Do not hardcode an assumed version; use the actual value read here.

- [ ] **Step 5: Bump `package/package.json`'s version**

  Increment the patch version by 1 from what Step 4 showed (e.g. `0.6.14` → `0.6.15`).

- [ ] **Step 6: Add a CHANGELOG entry**

  In `package/CHANGELOG.md`, add a new section immediately after the `# Changelog` header block and before the first existing `## [...]` entry, using the version from Step 5 and today's date in `YYYY-MM-DD` format:
  ```markdown
  ## [<new-version>] - <today's date>

  ### Added

  - `firebaseAuth.onSignIn`/`onEmailVerified`/`onSignOut` — optional callbacks on the `firebaseAuth` config, invoked by `AuthUserProvider` exactly once per real auth-lifecycle transition (not on routine token refreshes or repeated observations of an already-settled state). Lets consumer apps hook cleanup/side-effect logic — e.g. clearing per-account `localStorage` state on sign-out — without re-deriving the transition from raw `onIdTokenChanged` callbacks or duplicating `AuthUserProvider`'s own debounce logic. A throwing/rejecting callback is caught and logged via `console.error`; it never blocks cookie sync or navigation. See `docs/superpowers/specs/2026-08-05-auth-lifecycle-callbacks-design.md` for the full design.
  ```

- [ ] **Step 7: Final full-suite run to confirm nothing broke from the doc/version edits**

  Run: `cd package && npx vitest run && npx tsc --noEmit`
  Expected: all tests pass, `TypeScript: No errors found`.

- [ ] **Step 8: Do NOT commit**

  Per this plan's Global Constraints, leave all changes from Tasks 1-4 uncommitted in the working tree — the user will review and commit them personally. Do not run `git add`/`git commit`/`git push` for any file touched by this plan.

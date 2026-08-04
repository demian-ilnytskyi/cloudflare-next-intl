# Auth Lifecycle Callbacks (`onSignIn`/`onEmailVerified`/`onSignOut`) — Design

## Context

`firebase_auth`'s `AuthUserProvider` (`package/src/firebase_auth/client/auth_user_provider.tsx`) already observes every meaningful auth-state transition — sign-in, sign-out, and (as of the recent `verifyEmailPath` fixes) email verification — via its `onIdTokenChanged` listener and `reloadUser()`. It currently *acts* on these transitions itself (writing/clearing the session, refresh-token, and email-verified-hint cookies; redirecting) but gives consuming apps no hook to react to the same transitions with their own logic.

This gap was discovered concretely: CRV's `verify_email_send_status.tsx` persisted a resend-cooldown timestamp in `localStorage` under a fixed, unscoped key. Switching Firebase accounts in the same browser (sign out of A, sign in as B) left B inheriting A's still-running cooldown, because nothing told the component "the account changed, discard any per-account client state." The immediate fix scoped the key by `uid`, but the underlying gap — no supported way for a consumer to hook a real auth-lifecycle transition — remains, and will resurface for any other per-account client state (draft form data, cached preferences, etc.) an app adds later.

## Goals

- Give consumers a supported, documented way to run their own logic exactly once per real auth-lifecycle transition, without needing to re-derive that transition from raw `onIdTokenChanged` callbacks (which also fire on routine token refreshes) or duplicate `AuthUserProvider`'s existing debounce/confirmation logic.
- Zero additional setup beyond adding fields to the `firebaseAuth` config object already required for every other `firebase_auth` feature (`apiKey`, `redirectAuthPath`, etc.) — no new components, no extra JSX, no new provider prop.
- Never let a consumer's callback bug break `AuthUserProvider`'s own cookie-sync or redirect behavior.

## Non-goals

- No server-side (Edge middleware / `update_session.ts`) equivalent. These transitions are observed client-side today (the client SDK's `onIdTokenChanged`/`reload()`), and the concrete motivating bug (clearing browser `localStorage`) has no server-side analog — Edge middleware has no DOM access. If a genuine server-side use case surfaces later, it's a separate, later design.
- No callback for "token refreshed" (a plain re-mint with no sign-in/out/verification change) — `AuthUserProvider` already treats that as a no-op transition (via `syncedSignedIn`), and exposing it would just reintroduce the "fires on every refresh" problem these callbacks exist to avoid.
- No retry/queueing mechanism for failed callbacks — a callback that throws is logged and the provider moves on; it is not re-invoked.

## Design

### Config surface

Three new optional fields on `FirebaseAuthRoutingConfig` (`package/src/types/types.ts`), alongside the existing `apiKey`/`redirectAuthPath`/etc.:

```ts
/** Called once, the moment a real sign-in is observed (not on a plain token refresh of an existing session). Errors are caught and logged; a throw here never blocks session-cookie sync. */
onSignIn?: (user: import('firebase/auth').User) => void | Promise<void>;

/** Called once, on the false→true transition of `user.emailVerified` (not on every subsequent observation of an already-verified user). Errors are caught and logged. */
onEmailVerified?: (user: import('firebase/auth').User) => void | Promise<void>;

/** Called once, when sign-out is confirmed (after `AuthUserProvider`'s existing debounce for transient SDK null-callbacks — see `confirmedSignedOut`/`consecutiveNulls`). Errors are caught and logged. */
onSignOut?: () => void | Promise<void>;
```

Consumers just add these to the `firebaseAuth` object they already pass to `setIntlConfig` — no other wiring.

### Where they fire

All three live in `AuthUserProvider` (`package/src/firebase_auth/client/auth_user_provider.tsx`), reusing state it already tracks:

- **`onSignIn`**: in the `onIdTokenChanged` listener, fires when `isSignedIn && previous === false` (a real `null → user` transition) — the exact condition already computed for `flipped`, just narrowed to the sign-in direction. Runs after the session/refresh-token/hint cookies are written (consumer code can rely on cookies already being in sync when this fires), before `router.refresh()`.
- **`onSignOut`**: fires when `confirmedSignedOut` transitions from `false` to `true` — i.e., in the same place the existing `router.replace(fa.redirectAuthPath)` call already fires for a confirmed sign-out, immediately after `clearSession` has run. A new `useEffect` (or inline in the existing sign-out-redirect effect) tracks this transition with a ref, mirroring `syncedSignedIn`'s pattern, so it fires once per real sign-out, not once per re-render while already signed out.
- **`onEmailVerified`**: a new ref (`emailVerifiedRef`, initialized from `initialUser?.emailVerified ?? false`) tracks the last-observed value. Checked in both places that can first observe the transition: the `onIdTokenChanged` listener and `reloadUser()`. When `!emailVerifiedRef.current && user.emailVerified`, fire the callback, then set `emailVerifiedRef.current = true`. This covers both the "verified via out-of-band click, caught by the next `onIdTokenChanged` background refresh" and "verified, caught by `verify_email_send_status.tsx`'s explicit `reloadUser()` poll" paths — the two real paths this package's existing `verifyEmailPath` fixes already had to handle for cookie sync.

### Error handling

Each call site wraps its callback invocation:

```ts
try {
  await fa.onSignIn?.(user);
} catch (e) {
  console.error('AuthUserProvider: onSignIn callback failed', e);
}
```

Matches the existing pattern used for `writeSession`/`clearSession` failures elsewhere in this file — a failing consumer hook is logged and swallowed, never allowed to break `AuthUserProvider`'s own state sync or navigation.

### Fixing the concrete bug

With `onSignOut` available, CRV's `verify_email_send_status.tsx` cooldown fix (already shipped: scoping the `localStorage` key by `uid`) could alternatively — or additionally — clear the cooldown key directly in an `onSignOut` handler in its own `intl_config.ts`, as a second line of defense and as the idiomatic place future per-account client state gets cleaned up, instead of every component needing to remember to scope its own storage keys by uid individually.

## Testing

- Unit tests in `auth_user_provider.test.tsx` (existing file, already covers `onIdTokenChanged`/`reloadUser` transitions extensively):
  - `onSignIn` fires exactly once on a real sign-in, not on a subsequent token-refresh callback for the same user.
  - `onSignOut` fires exactly once after the existing double-null confirmation, not on the first (potentially transient) null.
  - `onEmailVerified` fires exactly once on the false→true edge via `onIdTokenChanged`, and once via `reloadUser()`, and not again on a subsequent observation of an already-verified user through either path.
  - A callback that throws (sync) or rejects (async) is caught, logged via `console.error`, and does not prevent the cookie writes / redirect / `router.refresh()` that would otherwise happen on that transition.
  - Omitting a callback (not set in config) is a no-op — no error, no call.
- No changes needed to `update_session.ts` or its test suite — this feature is entirely client-side.

# `src/firebase_auth`

Optional module, active only when `firebaseAuth` is set on the `RoutingConfig`
passed to `setIntlConfig` (see `../config/README.md`). Every exported
function/component calls `require_config.ts`'s `requireFirebaseAuthConfig`
first, which throws a descriptive error instead of no-op'ing if that config is
missing — this is the first thing to check when a firebase_auth call throws
unexpectedly.

## Layout

- `client/` — browser-side: `firebase_client.ts` (lazy SDK getter),
  `use_auth_user.ts` (`onIdTokenChanged` hook), `auth_user_cache.ts`,
  `auth_user_provider.tsx` (context provider, syncs session cookie),
  `auth_actions.ts` (login/signup/forgot-password `useActionState` factories).
- `server/` — RSC-side: `use_auth_user_server.ts`, `firebase_server.ts`,
  `auth_user_server_provider.tsx` (not used by the default auto-wiring path —
  see its doc comment for why).
- `middleware/update_session.ts` — refreshes the session cookie; called
  automatically by `../config/middleware.ts`'s default handler, not meant to
  be invoked directly by consumers.
- `error_messages/` — `firebase_auth_error_helper.ts` maps Firebase error
  codes to user-facing strings; `default_messages.en.ts` is the default set,
  overridable via `AuthActionMessages`.
- `types.ts` — `SerializedAuthUser` (RSC-serializable projection of
  `firebase/auth`'s `User`, used for first paint before the client's
  `onIdTokenChanged` listener fires and supersedes it with the real `User`).

## Gotchas

- `index.ts` deliberately does NOT re-export a single `useFirebaseAuthUser` —
  the barrel is a plain module graph and can't replicate the
  react-server/default export-condition split that the
  `cloudflare-next-intl/useFirebaseAuthUser` subpath provides. Import that
  subpath directly for the environment-resolving hook; the barrel only
  exposes the explicit `useFirebaseAuthUserClient` / `useFirebaseAuthUserServer`.
- Client and server hooks throw `"useAuthUser must be used within an
  AuthUserProvider"` if called outside their respective provider.

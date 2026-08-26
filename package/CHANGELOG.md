# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.40] - 2026-08-27

### Changed

- **Decoupled geo helpers from global config singleton.** `getCountry(input?, generate?)` and `getTimezone(input?, fallback?, generate?)` now accept explicit `generate` config parameter directly.
- **Flexible typing for `generate.env`.** Widened `GenerateRoutingConfig.env` type definition to accept `object | Record<string, unknown> | (() => ...)` for broader runtime compatibility.

## [0.8.39] - 2026-08-27

### Added

- **First-class Vinext and Cloudflare Workers runtime support.**
  - Added `generate.env` and `generate.ctx` to `RoutingConfig.generate` — allowing direct passing of bindings from `cloudflare:workers` and execution context from `vinext/shims/request-context` (`getRequestExecutionContext()`).
  - Added `getCountry(input?)` and `getTimezone(input?, fallback?)` helpers exported from `cloudflare-next-intl/server`, `cloudflare-next-intl/geo`, and root `cloudflare-next-intl`. Resolves visitor country and timezone from `next/headers` (`x-cf-country`, `cf-ipcountry`), `request.cf`, or `getCloudflareContext`.
  - Added `resolveEnv(generate?)` helper to extract Cloudflare environment bindings safely.
  - Automatic `x-cf-country` and `x-cf-timezone` header propagation in `intlMiddleware` to ensure Server Components and Server Actions receive geo metadata under Vinext and OpenNext.
  - `db` connection resolution and `reportError` now automatically utilize `generate.env` (for Hyperdrive) and `generate.ctx` (for backgrounded `waitUntil`).

## [0.8.38] - 2026-08-26

### Fixed

- **Prevent router prefetch redirect loops in `firebaseAuthMiddleware` (`update_session`).** Prefetch requests (`next-router-prefetch: 1`, `purpose: prefetch`, or `x-purpose: prefetch`) on routes that would redirect (guest on protected route, signed-in user on auth page, unverified email) now return an empty `204 No Content` with `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` instead of a 307/308 redirect, preventing Next.js segment cache from filing redirected responses under requested URLs and hammering the origin. Real navigation requests are unaffected and execute full redirect logic.

## [0.8.34] - 2026-08-26

### Fixed

- **`db.transaction()`'s build-only handle no longer throws on every property access.** The handle passed into a `.transaction()` callback previously threw the moment any method (`.insert`, `.select`, `.delete`, ...) was accessed at all, before a query could even be built — so every real-world callback using the documented `.toSQL()` pattern (e.g. `db.insert(t).values(...).onConflictDoNothing().toSQL()`) failed immediately with "this Drizzle handle is for building statements only," even though it was following that exact guidance. The handle is now a real `drizzle-orm/pg-proxy` builder backed by a driver that only throws when a query is actually executed (awaited without `.toSQL()`), so building and chaining queries works as documented and only genuine execute-in-callback mistakes are rejected.

## [0.8.31] - 2026-08-25

### Added

- **Dynamic Postgres role resolution and Firebase Custom Claims integration in `withUserDb`.** Added `authenticatedRoleClaim` (`string | false`, defaults to `'role'`) to `DbRoutingConfig`. When `firebaseAuth` is enabled, `withUserDb` reads the custom claim field on the signed-in user's Firebase ID token to select the Postgres role for RLS. `authenticatedRole` can now also be a sync or async function (`() => string | Promise<string>`) resolved on each invocation.

### Fixed

- **Query client serialization & session-state transaction handling in `withUserDb`.** Query client now serializes query executions to prevent session state setup races across concurrent queries. Automatically wraps `SELECT` queries in short-lived `BEGIN`/`COMMIT` blocks to safely set `request.jwt.claims` and `set role`, while handling multi-statement `BEGIN`/`COMMIT` transactions smoothly without state leaks. Automatically appends query comments `/* uid:<userId> */` to `SELECT`/`WITH` statements for trace debugging.

### Performance

- **Optimized statement parsing and tokenization.** Added statement and token LRU caches (up to 500 entries) in `parseStatement` and `tokenizeSql`. Refactored `tokenizeSql`, `parseComposite`, and `encodeParam` to use `charCodeAt()` character inspection and string slice paths for high-throughput SQL parsing.

## [0.8.30] - 2026-08-25

### Changed

- **Passwordless sign-in email parameter forwarding.** `createSendSignInLinkAction` now automatically appends the user's email as an `email` search parameter to the `actionCodeSettings.url` redirect URL. This enables the landing page to retrieve the email directly from the query parameters as a fallback.

## [0.8.29] - 2026-08-25

### Fixed

- **Fixed the real cause of the infinite `/` ↔ `verifyEmailPath` redirect loop** (0.8.27 and 0.8.28 both misdiagnosed it). A `'false'` value in the client-written `emailVerifiedHintCookieName` cookie was treated as proof the user is unverified, short-circuiting the confirmation refresh entirely. But that cookie is only a client-side mirror: once a user verifies their email, a browser holding a session minted before that keeps sending `email_verified: false` **and** a `'false'` hint that no longer matches reality. The middleware then redirected to `verifyEmailPath` without ever asking the Auth service — while the destination page resolves the same user through `getAuthUser()`/`initializeServerApp`, sees the live (verified) state, and redirects straight back. Diagnosed from a captured production session: the session JWT claimed `email_verified: false`, the hint cookie said `'false'`, yet a live mint from that session's refresh token returned `email_verified: true`. The hint may now only skip work when it agrees the user is **verified**; it can never stand in as proof that they are not.

## [0.8.28] - 2026-08-25

### Fixed

- **Actually fixes the infinite `/` ↔ `verifyEmailPath` redirect loop that 0.8.27 only partly addressed.** The middleware's confirmation refresh went through the refresh-token cache — and that cache entry is what produced the very token whose `email_verified` claim was in question, so the "forced refresh" routinely handed back the *same* token and confirmed nothing. The middleware then redirected to `verifyEmailPath` on that unconfirmed stale claim, where `getAuthUser()`/`initializeServerApp` resolves the same user as verified from live Auth-service state and redirects home — bouncing forever. 0.8.27 only covered the case where the client-written hint cookie was already `'true'`, so the loop persisted whenever that cookie was absent or stale (a hard `window.location` navigation right after verifying can outrun the cookie write). The confirmation refresh now skips the cache and only trusts a `false` claim when the mint genuinely produced a new token.

## [0.8.27] - 2026-08-25

### Fixed

- **Fixed an infinite redirect loop between `verifyEmailPath` and `homePath` right after email verification.** The middleware's forced-refresh check (used when the client-written verified-hint cookie says `true` but the session JWT's `email_verified` claim still says `false`) trusted that refreshed claim even when it came back still `false` — but token-claim propagation on Firebase's backend can lag behind the live account-info read `reload()` uses to set the hint, so the refresh doesn't always confirm anything new. Redirecting to `verifyEmailPath` on that stale claim collided with `getAuthUser()`/`resolveAuthUserAndRedirect()` independently resolving the same user as verified and redirecting home, bouncing the user between the two forever. A `true` hint now wins over a forced-refresh that still returns a stale claim.

## [0.8.26] - 2026-08-25

### Added

- **`signInPath` config field, forwarding `?mode=signIn` action links.** Passwordless email-sign-in links use Firebase's single project-wide action URL the same way password-reset/email-verify links do, but the middleware previously had no mapping for `signIn` — the request fell through to `redirectAuthPath` and the `oobCode` was lost. Set `firebaseAuth.signInPath` (e.g. `'/complete-sign-in'`) to have `?mode=signIn` forwarded there, query string intact, same as `verifyEmailPath`/`recoverEmailPath`.

### Fixed

- **A same-path `continueUrl` no longer clobbers the mode-derived forward target.** When `actionCodeSettings.url` for `sendSignInLinkToEmail`/similar calls is set to the app's own `actionLinkPath` (the single project-wide action URL), Firebase echoes that same URL back as `continueUrl` — which the middleware's continueUrl-following logic then treated as a genuine same-origin redirect target, overwriting the correctly-resolved mode path with a no-op (the request's own path), causing the forward to never fire. The middleware now ignores a `continueUrl` whose (locale-stripped) path equals the current request's path, keeping the mode-derived target instead. A `continueUrl` pointing anywhere else is unaffected.

## [0.8.25] - 2026-08-25

### Fixed

- **Internal library errors now route through `reportError`/`errorHandling` instead of calling `console.error` directly.** `intlMiddleware`, `getLocale`, `languageDetecotr`, `alternatesLinks`, `getCookie`, `setCookie`, `ClarityScript`, and `getTranslationsImpl` previously logged straight to `console.error`, bypassing `errorHandling.onError`, dedup/throttling, and `ignoreConsoleErrors` — so these internal failures were invisible to your configured error reporter (Sentry, Telegram, etc). They're now reported the same way your own `reportError` calls are.

## [0.8.24] - 2026-08-24

### Fixed

- **`pg` is loaded through a dynamic `import()` again.** 0.8.23 imported it statically, which pulled `pg` into the bundle for every app importing `cloudflare-next-intl/db` — including Supabase-mode apps that never open a Postgres connection and may not have `pg` installed at all. The documented guarantee that an app which never calls a `db` export never bundles `pg` holds once more. The resolved module is cached, so concurrent callers share one load.
- **Errors thrown by your own `withPublicDb`/`withUserDb` callback are no longer reported to `errorHandling.onError` as database client errors.** 0.8.23 wrapped the callback in the same `catch` used for connection failures, so an ordinary application `throw` (a missing row, a validation failure) was reported as `db.withDbClient.clientError`. Only a failure of `client.connect()` is reported now, as `db.withDbClient.connectError`; your errors propagate to you untouched.
- **`connectToPostgres` works again instead of throwing.** 0.8.23 replaced it with a stub that threw on every call — a breaking change to a documented export, shipped in a patch release. It now returns a connected client you own. See *Deprecated* below.
- `withDbClient` no longer calls `client.end()` when `connect()` never succeeded.

### Added

- **`withDbClient(config, fn)`** is now exported from `cloudflare-next-intl/db`. 0.8.23 introduced it as the replacement for `connectToPostgres` but never exported it, leaving no supported way to get a raw client.

### Deprecated

- **`connectToPostgres` / `disconnectPostgres`.** Both work: `connectToPostgres` returns a connected client you own, `disconnectPostgres(client)` closes it. They no longer share or cache a client, so you must close what you open — prefer `withDbClient`, which closes it for you even when the callback throws. Note `disconnectPostgres` now takes the client rather than the config.
- **`resetConnectionState`** — a no-op; no cached connection state remains.
- **`withSessionLock`** — runs its callback directly; per-call clients cannot leak session state, so there is nothing to serialize.
- **`db.disconnectAfterRequest`** — ignored. No connection survives a call to be kept open; the only remaining effect of `false` is that teardown is awaited rather than deferred to `ctx.waitUntil`.
- **`db.disconnectTimeoutMs`** — ignored. Teardown is awaited or deferred to `ctx.waitUntil` without a timeout.

### Changed

- `withUserDb` no longer issues a trailing `reset role`. The session is closed immediately afterwards, so it was a wasted round-trip on every call.

## [0.8.23] - 2026-08-24

### Fixed

- **Cross-request role/RLS identity leakage in Postgres/Hyperdrive mode, and the `"there is already a transaction in progress"` errors that came with it.** Every `withPublicDb`/`withUserDb` call in a Worker isolate shared one module-scoped `pg.Client`. Because a Postgres session carries its own state — `request.jwt.claims`, the current role, any open transaction — two concurrent calls in the same isolate were writing to *the same session*: one caller's `set role`/`set_config` could still be in effect when another caller's queries ran, so a user could be served rows selected under someone else's RLS identity. 0.8.18's `withSessionLock` and 0.8.19's transaction removal narrowed this by serializing access, but a lock cannot fix state that is shared by construction, and it serialized every DB call in the isolate to do it. Each `withPublicDb`/`withUserDb` call now opens its own client, runs on it, and closes it — sessions are never shared, so the leak is structurally impossible rather than merely guarded against. Hyperdrive pools the server-side connection underneath, which is what it is designed for. Concurrent calls no longer block one another.
- **An unhandled `'error'` event on the shared client no longer crashes an unrelated request.** With no long-lived shared client left to emit it, the failure mode fixed defensively in 0.8.20 cannot occur in `withPublicDb`/`withUserDb`.
- **The client is closed even when your callback throws**, via `finally`. The previous refcount (`activeUsers`) could desync on any unpaired connect/disconnect and leave a Hyperdrive slot held.

### Changed

- **Postgres connections are no longer reused across calls within a request.** Each `withPublicDb`/`withUserDb` costs its own connect and close. This is the price of the isolation above; Hyperdrive pools the server-side connection, so what is added is the client-side handshake, not a new Postgres backend. If a single render issues many separate DB calls, prefer grouping them into one `withPublicDb`/`withUserDb` callback.

### Known issues

Fixed in 0.8.24 — upgrade past this release: `pg` was imported statically (bundled even for Supabase-only apps), `connectToPostgres` threw on every call, `withDbClient` was not exported, and errors thrown by your own callback were reported as database client errors.

## [0.8.22] - 2026-08-24

### Fixed

- **`"Connection closed"` client errors no longer reach `errorHandling.onError`.** 0.8.20 added an `'error'` listener on the shared Postgres client that suppressed the expected `"connection terminated"` shape, but Hyperdrive also closes idle sockets with a `"Connection closed"` message, which still reported as an application error. Both shapes are now treated as expected socket teardown.

## [0.8.21] - 2026-08-24

### Added

- **Passwordless (email-link) Firebase sign-in actions.** `createSendSignInLinkAction(locale, actionCodeSettings)` in `./firebaseAuthActions` — factory returning a `useActionState`-shaped form action that sends a Firebase sign-in link; returns `{ success: true, email }` on success so the caller can persist the trimmed email (e.g. to `localStorage`) for the completion step. `completeSignInWithLink(locale, url, email)` — plain async function (not `useActionState`-shaped, since it runs from an effect on the emailed link's landing page rather than a form submit) that completes the sign-in. Both exported from the package root and the `./firebaseAuthActions` subpath.
- `AuthFormState` (in `./firebaseAuthActions`'s shared types) gains an optional `email?: string` field, populated by `createSendSignInLinkAction`.

## [0.8.20] - 2026-08-24

### Fixed

- **Unhandled `'error'` event on the shared Postgres/Hyperdrive client.** `connectToPostgres`'s `pg.Client` is an `EventEmitter` that can outlive a single request (`db.disconnectAfterRequest: false`). When Hyperdrive/Postgres closed its idle socket, `pg` emitted `'error'` with no listener attached — Node treats that as unhandled and throws, crashing whatever unrelated request happened to be running in the isolate at that moment (surfaced to users as a generic top-level "Something went wrong" error page, unrelated to the page they were on). `connectToPostgres` now attaches an `'error'` listener that resets the cached client/connection state (so the next call reconnects cleanly) and reports anything other than the expected "Connection closed" shape through `errorHandling.onError`.
- **`ignoreConsoleErrors`/`ignoreConsoleError` now apply to every `reportError` call, not just `console.error`.** Previously this filter was only checked inside `installConsoleErrorOverride`'s patched `console.error` — a direct `reportError`/`reportClientError` call (e.g. a caught DB error, or an error boundary reporting `error`) always reached `errorHandling.onError` regardless of the ignore list. The check now lives in `reportError` itself, so both paths share one ignore list; `installConsoleErrorOverride` no longer duplicates it.

## [0.8.19] - 2026-08-24

### Fixed

- **`withUserDb` no longer opens a `BEGIN`/`COMMIT` transaction on the shared Postgres/Hyperdrive client.** 0.8.18's `withSessionLock` closed the race between two concurrent callers *starting* their transactions on the shared client, but Postgres logs still showed `"there is already a transaction in progress"` / `"there is no transaction in progress"` afterward — the lock serializes access to the client, but a live transaction is itself session state, and this package's own transaction handling was reasoning about it as if it were call-scoped. `withUserDb` now sets `request.jwt.claims`/role directly on the session (`set_config(..., false)`, `set role`, `reset role` once `fn` settles) with no transaction wrapper — none of that needs one to apply. Callers that need atomicity across statements still get it from `db.transaction(...)` on the handle `withUserDb`/`withPublicDb` pass in, which now opens its own real `BEGIN`/`COMMIT` — safe there specifically because it only ever runs from inside the `withSessionLock`-guarded body, so it can never overlap another caller's.

## [0.8.18] - 2026-08-24

### Fixed

- **Concurrent `withUserDb`/`withPublicDb` calls in Postgres/Hyperdrive mode:** every request in a Worker isolate shares one `pg.Client`. When a single request issued more than one `withUserDb`/`withPublicDb` call concurrently (e.g. several `Promise.all`'d reads, each opening its own transaction), their `BEGIN`/`SET LOCAL ROLE`/`set_config('request.jwt.claims', ...)`/`COMMIT` statements could interleave on that one connection, so one caller's role/RLS identity could leak into another's queries mid-flight — surfacing as intermittent, page-dependent query failures. `withUserDb`/`withPublicDb` now serialize their entire transaction body through a session-scoped lock (`withSessionLock`, `db/connection.ts`) so only one caller's session state is active on the shared client at a time. Supabase mode is unaffected — it never shared a live session in the first place.
- `connectToPostgres`'s concurrent-caller race (two callers both starting a new client when both saw `client === null` before either had awaited anything) is now closed by setting the connecting guard synchronously before any `await`.

## [0.8.17] - 2026-08-24

### Fixed

- **Postgres/Hyperdrive Mode Transactions:** `.transaction(...)` callbacks inside `withPublicDb`/`withUserDb` under Postgres/Hyperdrive mode now correctly execute all returned queries and return `TransactionResult[]` (the actual rows/rowCount array), instead of erroneously falling back to Drizzle's native savepoint and returning the unexecuted `.toSQL()` query objects. Both Supabase and connection-string mode now share the exact same query-building and execution behavior.

## [0.8.16] - 2026-08-24

### Changed

- **Breaking:** `withUserTransaction`/`withPublicTransaction` are removed. Multi-statement atomicity is now reached through `.transaction(...)` on the handle `withUserDb`/`withPublicDb` already hand your callback — one method name in both transport modes. In connection-string mode this is unchanged (a real Drizzle transaction, later statements may use earlier results); in Supabase mode it now runs on `.transaction()` too, atomically via `cfni_exec_batch`, though its callback must build queries (`.toSQL()`) rather than execute them, same as `withUserTransaction`/`withPublicTransaction` required before — only the entry point moved.

## [0.8.15] - 2026-08-24

### Added

- `db` helpers: `now()` (`sql\`now()\``) and `fromNow(amount, unit)` (`now() + (N unit)::interval`), alongside the existing `ago(amount, unit)` (`now() - (N unit)::interval`) — for building a future timestamp expression the same way `ago` already builds a past one.

## [0.8.14] - 2026-08-24

### Added

- `db.supabase.url`/`db.supabase.anonKey`/`db.connectionString`, when given as a function, may now return `null` (not just `undefined`) to mean "nothing here" — matching `db.getUserId`/`db.getAccessToken`, which already accepted `string | null`. Both are treated identically wherever these are resolved; this only widens the accepted type so a resolver returning `someValue ?? null` type-checks.
- `withUserDb`'s `uid` parameter now also accepts `null` (previously only `string | undefined`), so a caller's own uid lookup — which may itself come back empty — can be passed straight through without an extra `?? undefined`.
- `resolveDbMode` now actually calls (and awaits) a function-based `db.connectionString` to decide the transport, instead of only checking that it is set. A resolver that resolves to `null`/`undefined` now falls through to `db.supabase` instead of locking in Postgres mode and failing later in `connectToPostgres` with no Supabase fallback ever tried. It returns the resolved value alongside the chosen mode (`{ mode: 'postgres', connectionString } | { mode: 'supabase', supabase }`) so `connectToPostgres` never has to resolve `db.connectionString` a second time — `connectToPostgres` now takes an optional second `resolved` argument for this, defaulting to its previous self-resolving behavior when omitted.

## [0.8.13] - 2026-08-23

### Fixed

- `cfni-db-codegen` moved `drizzle-kit` from a devDependency to a real dependency of this package, and now invokes its installed `bin.cjs` directly instead of shelling out through `npx drizzle-kit`. Previously, once published, a consumer relying on this package's own `drizzle-orm`/`drizzle-kit` (rather than adding both directly) would hit `Error please install required packages: 'drizzle-orm'` — `npx`'s own binary resolution didn't reliably walk back to this package's `node_modules` the way a plain `require()` from this file always does, and `drizzle-kit` wasn't guaranteed to be installed there at all since it was dev-only.
- The default rpc install location moved from `<sibling of --ddl-dir>/rpc` to `<--ddl-dir>/rpcs` (e.g. `supabase/data-base/rpcs` for the documented `supabase/data-base` default) — matching where a project's own DDL walk (and this package's own `supabase/data-base/rpcs/`) actually keeps `cfni_exec.sql`, instead of a path nothing else in a project's DDL structure uses. `--rpc-dir`/`CFNI_DB_RPC_DIR` override it exactly as before if a project already uses the old layout.

## [0.8.12] - 2026-08-23

### Fixed

- The `cfni-db-codegen` ephemeral-Postgres fallback (added in 0.8.10) now applies DDL in each directory's `order.txt` order — mirroring `supabase/scripts/db_start.sh` — instead of a flat alphabetical walk, so a function that depends on another defined later in the alphabet no longer fails to create. It also pre-creates the standard Supabase roles (`anon`, `authenticated`, `service_role`, etc.) that a plain `embedded-postgres` cluster doesn't have, and now tears down (and removes) a partially-started ephemeral instance if DDL loading fails partway through, instead of leaking a running Postgres process and its data directory.
- `cfni-db-codegen` no longer requires a `drizzle.config.*` in the consuming project: when `--drizzle-config`/`CFNI_DB_DRIZZLE_CONFIG` isn't set, it now generates one on the fly (pointing at the effective DB URL) instead of failing with `drizzle.config.json file does not exist`. It also now runs `drizzle-kit` from this package's own directory rather than the consumer's — `drizzle-kit` itself requires `drizzle-orm` at runtime, and npm doesn't reliably hoist this package's `drizzle-orm` dependency into a consumer's top-level `node_modules`, which previously surfaced as `Error please install required packages: 'drizzle-orm'` in projects that don't also depend on `drizzle-orm` directly.

## [0.8.10] - 2026-08-23

### Added

- `cfni-db-codegen` no longer requires a running local Postgres/Docker/Supabase to work: when no `--db-url`/`CODEGEN_DATABASE_URL` is set and nothing is reachable at the local Supabase default, it now falls back to a throwaway, local-only Postgres started via `embedded-postgres` (a prebuilt binary, no Docker) — the DDL in `--ddl-dir` is loaded into it, introspected, and it's torn down afterward. `embedded-postgres` is now a regular dependency, so this works out of the box with no extra install step. Passing an explicit `--db-url`/`CODEGEN_DATABASE_URL` skips the fallback entirely and still fails loudly if that target is unreachable.

## [0.8.9] - 2026-08-23

### Added

- `withUserTransaction`/`withPublicTransaction` (`cloudflare-next-intl/db`): run several statements atomically in Supabase mode, where `withUserDb`/`withPublicDb`'s `.transaction()` cannot (each of their statements is an independent PostgREST round-trip with no shared session). `build` returns queries built with `.toSQL()` — never executed directly — which are rendered and sent as one `cfni_exec_batch` call; the Postgres function runs them in order inside a single plpgsql call, itself an implicit transaction, so a failure on any statement rolls back everything before it in the batch. In connection-string mode these throw, pointing back at `withUserDb`/`withPublicDb`'s own `.transaction()`, which already provides real atomicity there.
- `supabase/cfni_exec.sql`: added `cfni_exec_batch(statements text[])`, the atomic batch runner behind the new TypeScript API. Ships and installs alongside `cfni_exec` (same file, same `cfni-db-codegen`/`cfni-db-install-exec` step) and follows the same `db.supabase.rawSql` gate — no separate config flag.
- `cfni-db-codegen`/`cfni-db-install-exec`: `--rpc-file-name=`/`--tests-file-name=` (also `CFNI_DB_RPC_FILE_NAME`/`CFNI_DB_TESTS_FILE_NAME`) let a project rename the installed `cfni_exec.sql`/its pgTAP test file — useful now that the file ships both `cfni_exec` and `cfni_exec_batch`. Default unchanged (`cfni_exec.sql` for both).

## [0.8.8] - 2026-08-23

### Fixed

- `supabase/cfni_exec.sql`: set `search_path = public` on both `cfni_exec` and
  `cfni_top_level_verb` to resolve the Supabase Security Advisor
  "Function Search Path Mutable" lint errors (`0011_function_search_path_mutable`).

## [0.8.7] - 2026-08-23

### Breaking

- Removed `supabaseSelect`, `supabaseInsert`, `supabaseUpsert`, `supabaseUpdate`, `supabaseDelete`, `supabaseRpc` and their `*AsUser` counterparts. Use `withPublicDb`/`withUserDb`; in Supabase mode statements are now translated to PostgREST calls automatically and only fall back to `cfni_exec` when they cannot be.

### Added

- `cloudflare-next-intl/dbEslint`: a flat-config fragment that blocks direct `@supabase/supabase-js`/`pg`/`postgres` imports in application code.
- Automatic PostgREST SQL translation supporting single-table `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `ON CONFLICT`, `RETURNING`, `count(*)`, and 20+ SQL comparison/regex/range/fts operators.

## [0.8.6] - 2026-08-23

### Added

- `dbHelpers` re-exports more `drizzle-orm` predicates so consumers building
  queries against `withPublicDb`/`withUserDb` no longer need a direct
  `drizzle-orm` dependency: `inArray`, `notInArray`, `ne`, `like`, `ilike`,
  `between`, `not`, and `exists` join the existing operators.
- New `cloudflare-next-intl/dbSchema` entrypoint re-exports `drizzle-orm/pg-core`
  table builders (`pgTable`, `varchar`, `index`, …) plus the `sql` tag, so
  generated schema files can import from this package instead of `drizzle-orm`
  directly.
- New `supabaseSelect`/`supabaseInsert`/`supabaseUpsert`/`supabaseUpdate`/
  `supabaseDelete`/`supabaseRpc` (and `*AsUser` counterparts) call the
  Supabase REST API directly through `@supabase/supabase-js`'s `.from()`/
  `.rpc()` — no `cfni_exec`, no raw SQL — for apps that set the new
  `db.supabase.rawSql: false`. Filters cover the full `postgrest-js` operator
  set (`eq` through `rangeAdjacent`, plus negation via `not`, `match`, `or`,
  and `textSearch`) — everything `@supabase/supabase-js`'s query builder can
  express against a single table, since `.from()` returns a `postgrest-js`
  builder directly.
- `supabase/tests/cfni_exec.sql`: a pgTAP suite (runnable via `supabase test
  db`/`pg_prove`) covering `cfni_exec.sql` directly — every statement shape it
  classifies, value fidelity, and RLS-per-role behavior. Plus
  `src/db/cfni_exec.integration.test.ts`, a Vitest suite driving the same
  scenarios through the real transport path (`inlineParams` → `cfni_exec` →
  `parseComposite`) over an actual Postgres connection; it's skipped unless
  `CFNI_TEST_DATABASE_URL` is set, so a normal `npm test` never needs a
  database.
- `cfni-db-codegen` now also installs `cfni_exec.sql` (and its pgTAP test
  file) into your project — `--rpc-dir`/`--tests-dir`
  (`CFNI_DB_RPC_DIR`/`CFNI_DB_TESTS_DIR`, default siblings of `--ddl-dir`) —
  after a successful run, gated on the project's `db.supabase.rawSql` (read
  from `next.config.*`'s `@intl-config` alias; a warning is printed, and
  `true` assumed, if it can't be determined). An existing, differing target
  is left alone unless `--force`/`CFNI_DB_FORCE_EXEC=true` is set; pass
  `--skip-exec`/`CFNI_DB_SKIP_EXEC=true` to turn the whole step off. New
  standalone `cfni-db-install-exec` binary runs only this step, with no
  `drizzle-kit pull` and no live Postgres needed.

### Fixed

- Supabase mode (`cfni_exec`) previously accepted only a narrow subset of
  what connection-string mode does. Now fixed:
  - Query parameters are inlined as typed Postgres literals before the
    statement is sent (`inline_params.ts`/`encode_param.ts`), instead of
    being passed to `cfni_exec` for `EXECUTE ... USING` binding — which only
    ever bound the *first* parameter correctly and always as `text`.
  - `cfni_exec` now supports `INSERT`/`UPDATE`/`DELETE`, with or without
    `RETURNING` (previously only `SELECT`-shaped statements worked, since
    DML can't be wrapped in `FROM (...)`), including writable CTEs.
  - Row values now round-trip through Postgres' composite-literal text
    format (`r::text`, parsed back by `parse_composite.ts`) instead of
    `json_build_array`/`row_to_json`, which re-encoded arrays as JSON
    (`[1,2]` instead of `{1,2}`) and collapsed duplicate column names from
    joins (`select a.*, b.*`).
  - `cfni_exec` now returns `jsonb` instead of `json`, and a `rowCount`
    alongside `rows`.
  - `.transaction()` on the Supabase-mode `DrizzleDb` now throws immediately
    (no atomicity is available over PostgREST) instead of running its
    callback non-atomically with no warning.
  - Firebase-ID-token auth failures against PostgREST now name Supabase
    third-party (Firebase) auth setup as the likely fix.

  Upgrading requires reinstalling `supabase/cfni_exec.sql` — the file starts
  with `drop function if exists` so re-running it is always safe.

## [0.8.5] - 2026-08-23

### Added

- `cfni-db-codegen` can generate into several projects in one run: `--out-dir` is now repeatable and accepts a comma-separated list (as does `CFNI_DB_OUT_DIR`). The database is introspected once and the identical schema plus `manifest.json` is written to every target; `--check` verifies all of them and fails naming the first stale one. A single `--out-dir` behaves exactly as before.
- Documented the previously undocumented `cfni-db-codegen` CLI (flags, env vars, defaults) in the README and `llms.txt`.

## [0.8.4] - 2026-08-23

### Removed

- **Breaking:** `db.hyperdriveBinding` is gone, along with the implicit `'HYPERDRIVE'` binding lookup. `db.connectionString` is now the only way to configure direct Postgres access. A Hyperdrive binding is still fully supported — read it in a `connectionString` function, which is resolved on each connect: `connectionString: async () => (await getCloudflareContext({ async: true })).env.HYPERDRIVE.connectionString`. This removes a second, magic resolution path in favour of the explicit one added in 0.8.3, so where the connection string comes from is visible in your own config.
- `resolveDbMode` now selects direct Postgres from `connectionString` alone; `connectToPostgres` no longer touches `generate.getCloudflareContext`, and its "no connection string" error points at `db.connectionString` instead of naming a binding.

### Migration

Replace `db: { hyperdriveBinding: "HYPERDRIVE" }` with a `connectionString` function reading that binding (see above). Configs already setting `connectionString` need no change.

## [0.8.3] - 2026-08-23

### Changed

- `db.connectionString`, `db.supabase.url`, and `db.supabase.anonKey` each now accept either a string or a sync/async function returning one, typed as the new exported `ConfigValue<T>`. Function values are resolved at use time rather than when the config object is created, so a connection string or Supabase key can come from a secret store, a Cloudflare binding, or any other source that isn't available at module scope. Passing plain strings behaves exactly as before, so this is a source-compatible change.
- `resolveSupabaseEndpoint` is now `async` (it may have to await a resolver). In Supabase mode the URL and anon key are resolved inside the cached client factory, so resolution happens once per client instead of on every statement. `resolveDbMode` stays synchronous — a function value is truthy, which is already the correct "direct Postgres is configured" signal, and it is never invoked just to pick a mode.

## [0.8.2] - 2026-08-23

### Fixed

- The package root barrel (`import ... from "cloudflare-next-intl"`) no longer re-exports the `db` module. `db` connects to `pg`/`drizzle-orm`/`@supabase/supabase-js`, none of which are browser-safe; re-exporting it at root meant any client component importing anything from the package root (e.g. `import { Link } from "cloudflare-next-intl"`) pulled `pg`'s Node-only internals (`fs`/`net`/`dns`/`tls`) into its bundle graph, breaking production builds. `db`/`dbHelpers`/`dbTesting` remain reachable via their dedicated subpaths, matching how `firebase_auth` was already handled. `DbRoutingConfig`/`SupabaseDbConfig` types remain available at root (type-only, no bundle cost).

## [0.8.1] - 2026-08-23

### Added

- `cloudflare-next-intl/dbTesting` — exports `makeFakeDb`/`rowsResult`/`executeResult`, a fake `DrizzleDb` for unit-testing code that calls `withPublicDb`/`withUserDb` without a real Postgres connection. Records every intermediate chain call (`.where()`, `.values()`, etc.) with its exact arguments for assertions, and handles `$with`/`with` CTE-style queries.
- `cloudflare-next-intl/dbHelpers` now re-exports `drizzle-orm`'s common query-building primitives (`eq`, `and`, `or`, `asc`, `desc`, `gte`, `gt`, `lte`, `lt`, `isNull`, `isNotNull`, `count`, `sum`, `max`, `min`, `sql`), so repository code that only builds queries against the `DrizzleDb` handle no longer needs its own `drizzle-orm` import for these.

## [0.8.0] - 2026-08-23

### Added

- `db.supabase` config lets `withPublicDb`/`withUserDb` reach Postgres through the Supabase Data API (PostgREST) instead of a direct connection, using only `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` — no Postgres password required. Query code is identical to connection-string mode; a direct connection always wins if both are configured. Requires installing the `security invoker` SQL function shipped at `supabase/cfni_exec.sql`. `withUserDb` resolves identity from `db.getAccessToken` or the signed-in Firebase user's ID token, sent as the PostgREST bearer token, rather than a `set_config`/`set local role` transaction — so Supabase mode has no multi-statement atomicity (each statement is its own round-trip).
- `@supabase/supabase-js` added as a dependency, loaded via dynamic `import()` alongside `pg`/`drizzle-orm` so it only bundles for apps that actually use the `db.supabase` transport.

### Changed

- `withPublicContext`/`withUserContext` renamed to `withPublicDb`/`withUserDb` for clarity against `generate.getCloudflareContext` in the same config surface.
- `pg` and `drizzle-orm` moved from optional peer dependencies to regular dependencies (pinned to their latest versions) and are now lazily loaded via dynamic `import()` inside the `db` exports, so non-`db` consumers no longer need to install them and never bundle them.

### Fixed

- `connectToPostgres` no longer caches a failed connect attempt forever — a transient error (bad Hyperdrive binding, network blip) previously broke `db` access for the lifetime of the Worker isolate; the next call now retries.

## [0.7.8] - 2026-08-21

### Added

- Firebase App Check now supports remote OAuth minting via `oauthClientId`, `oauthClientSecret`, and `oauthRefreshToken` as an alternative to `privateKey`. Use this when GCP org policies (`iam.disableServiceAccountKeyCreation`) prevent creating service account keys. Tested with new `scripts/check_app_check_signjwt.mjs` helper.

## [0.7.7] - 2026-08-21

### Fixed

- `logout()` in `AuthUserProvider` skips redirecting to `redirectAuthPath` when called on a whitelisted path (`whiteListPaths`), allowing pages like account deletion to finish rendering after signing out.

## [0.7.6] - 2026-08-21

### Fixed

- `update_session` middleware prioritizes `actionLinkPath` over mode target path when redirecting cross-origin action links with a `continueUrl` path of `/`.
- `resolveAuthUserAndRedirect` on the server now uses path-segment prefix matching (`isWhitelisted`) for `whiteListPaths` (e.g. `/bonds` covers `/bonds/some-slug`), aligning server-side auth redirects with client-side whitelist rules.

## [0.7.5] - 2026-08-21

### Fixed

- `update_session` middleware redirects cross-origin action links to `actionLinkPath` (e.g. `/auth/action`) on the target origin when `parsed.pathname` is `/`, allowing the target origin's middleware to process the action link mode.

## [0.7.4] - 2026-08-21

### Fixed

- `update_session` middleware now falls back to the mode target path (e.g. `/reset-password`) when an emailed Firebase action link's `continueUrl` points to the home root (`/`).

## [0.7.3] - 2026-08-20

### Fixed

- `update_session` middleware external origin `continueUrl` handling.

## [0.7.2] - 2026-08-19

### Added

- `AutoFirebasePerformanceEvents` auto-tracks SPA route-change duration (`route_change`), main-thread long tasks (`route_long_tasks`), and slow non-fetch/XHR resource loads (`slow_resource`) as Firebase Performance custom traces alongside Web Vitals metrics.
- `getFirebasePerformanceSync()` exported from `firebaseAuthClient` (`firebase_client.ts`).

## [0.7.1] - 2026-08-15

### Added

- `t.raw(key)` on the translator function returned by `getTranslations` —
  returns the raw `TranslationEntry` (string, array, or nested object) at
  `key` without the string-only coercion `t(key)` applies. Mirrors
  `next-intl`'s `t.raw`. Needed for messages whose value is an array (e.g. a
  list of social links) — `t(key)` on such a key previously warned and fell
  back to returning the key itself, since it only ever returned `string`.

## [0.7.0] - 2026-08-14

### Added

- `cloudflare-next-intl/serverProviderStatic` — an `output: 'export'`-safe
  drop-in for `IntlProvider`. The regular provider's client tree always has
  a code path to the firebase-auth client provider, which imports a
  `"use server"` file (`clear_session_action`); Next's server-actions build
  step registers that file the moment any `import()` in the compiled module
  graph points to it, even one gated by a runtime `if (config.firebaseAuth)`
  check — the guard skips executing the import, not the import statement
  itself. `output: 'export'` fails outright the instant any server action is
  registered anywhere in the app, so this affected every static-export app,
  not just ones using Firebase Auth. The new variant's client provider
  (`client_provider_static`) has zero import anywhere pointing at the
  firebase-auth client code, so there's nothing for the scanner to find. It
  does not support `firebaseAuth` — that combination throws at render time;
  use the regular `serverProvider` for apps that need Firebase Auth. See the
  README's "Static export (`output: 'export'`) support" section, including
  the webpack-alias approach for apps that import `IntlProvider` from the
  package root and can't change that import site per build target.

## [0.6.34] - 2026-08-11

### Changed

- Minor internal improvements;

## [0.6.33] - 2026-08-11

### Changed

- Added test coverage for `isIdTokenExpired`, `refreshIdToken`'s
  `{ skipCache: true }` option, and the ON-`verifyEmailPath` forced-refresh
  block's `invalid`-refresh-token outcome — no behavior change, closes branches
  left uncovered by 0.6.32's fixes.

## [0.6.32] - 2026-08-10

### Fixed

- A signed-in user could render as signed out on the server (`getAuthUser()`
  returning `null` while the client still showed the account) with
  `FirebaseServerApp could not login user with provided authIdToken` /
  `auth/invalid-user-token` logged. Three separate causes, all fixed:
  - **The middleware's refresh cache could serve an expired ID token.** Firebase
    does not rotate refresh tokens, so the cache key (derived from the refresh
    token) never changed, and a cached entry kept being handed out past the ~1hr
    lifetime of the ID token inside it. Cache hits are now validated against the
    token's own `exp` before use, and the cache TTL dropped from 50 to 30
    minutes.
  - **A rejected token was never retried server-side.** `initializeServerApp`
    does not reject for an invalid/revoked token — it logs the message above
    itself and resolves `authStateReady()` with `currentUser === null`. A null
    user now triggers one refresh-and-retry from the refresh-token cookie (as
    does a thrown `auth/invalid-user-token`, for good measure), instead of
    rendering the request as signed-out.
  - **That retry could refresh into the same bad token**, since the cache entry
    is what produced it. `refreshIdToken` accepts a new `{ skipCache: true }`
    option, used by the retry path to force a fresh round-trip.

  After a successful retry the new session/refresh pair is written back to the
  cookie jar when the context allows it (Server Actions, Route Handlers); during
  an RSC render, where cookie writes are not permitted, this is silently skipped
  and the middleware persists the pair on the next request. The retry gives up
  without looping when there is no refresh-token cookie, the refresh fails, or
  it returns the same rejected token.

### Changed

- Session/refresh cookie attributes are now produced by a single exported
  `sessionCookieOptions()` helper (with `DEFAULT_SESSION_MAX_AGE` /
  `DEFAULT_REFRESH_MAX_AGE`) shared by the middleware and the server-side
  refresh, so the two writers cannot drift into writing the same cookie pair
  with different flags or lifetimes. `secure` remains the one intentional
  difference: the middleware derives it from the request protocol (so a
  plain-http local dev origin still receives the cookie), while the server-side
  path, which has no request URL, always sets it.

## [0.6.31] - 2026-08-10

### Added

- New `FirebaseAuthRoutingConfig.preserveRedirectQuery` option (defaults to
  `true`): every `firebase_auth` redirect (`redirectAuthPath`, `homePath`,
  `verifyEmailPath`) now carries the original request's query string over to its
  target — e.g. `/login?ref=abc` redirecting a signed-in user to `homePath` now
  lands on `/?ref=abc` instead of dropping to `/`. Applies consistently across
  all three redirect layers: `intlMiddleware`'s own `update_session` logic, the
  RSC pre-render redirect (`resolveAuthUserAndRedirect`), and the client
  `AuthUserProvider` effect. Set `preserveRedirectQuery: false` to restore the
  old bare-path behavior. `intlMiddleware` now also sets an `x-search` header
  (alongside the existing `x-pathname`) so the RSC layer — which has no access
  to the request URL, only `headers()` — can read the query string too.

## [0.6.29] - 2026-08-09

### Added

- `createServerErrorAction`'s returned action now attaches
  `requestContext: { path, userAgent, referer }` alongside your own `params` on
  every report — `path` from the `x-pathname` header `intlMiddleware` sets,
  `userAgent`/`referer` read directly via `next/headers`. Best-effort: falls
  back to `{}` if `next/headers` throws (e.g. outside a request scope) rather
  than failing the report.

## [0.6.28] - 2026-08-09

### Fixed

- `mintServerAppCheckToken`'s custom JWT used the wrong `aud` (audience) claim —
  `.../google.firebase.appcheck.v1.FirebaseAppCheck` (the App Check API's own
  resource name) instead of
  `.../google.firebase.appcheck.v1.TokenExchangeService` (the token-exchange
  service `exchangeCustomToken` actually expects). Google's real backend rejects
  the wrong audience with an opaque `403 App attestation failed`, no indication
  the audience is the problem — this looked identical to a
  permissions/App-Check-provider-registration issue and cost real investigation
  time before being traced to `firebase-admin`'s own
  `AppCheckTokenGenerator.createCustomToken` (`token-generator.js`), which this
  now matches exactly. Also switched the custom token's lifetime from a
  configurable `customTokenLifetime` (default `'1h'`) to a fixed 5 minutes —
  `firebase-admin` hardcodes this too, and Google's real minting endpoint
  rejects longer custom-token lifetimes outright regardless of what's requested,
  so the option was a footgun with no working range above 5 minutes.
  **Breaking:** `FirebaseAppCheckConfig.customTokenLifetime` removed — it never
  had a value greater than 5 minutes that would actually work.

  Verified against Firebase's real `exchangeCustomToken` endpoint with a live
  service account and project (not mocked) before landing this fix.

## [0.6.27] - 2026-08-09

### Fixed

- `mintServerAppCheckToken`'s `exchangeCustomToken` call now authenticates with
  the project's Web API key (`?key=`). Google rejected the request outright as
  an unregistered/unidentified caller (403 `PERMISSION_DENIED`) before the
  custom token itself was even evaluated. `mintServerAppCheckToken` now takes
  `apiKey` as a second positional argument (before `appCheck`);
  `getAuthenticatedAppForUser` passes `fa.apiKey` through automatically — no
  config changes needed.

## [0.6.26] - 2026-08-09

### Changed

- **Breaking:** `FirebaseAppCheckConfig.clientEmail`, `privateKey`, and `appId`
  are now required fields instead of optional. They were already required
  together at runtime for server-side App Check token minting
  (`mintServerAppCheckToken` silently no-op'd if any were missing) — this just
  makes that a compile-time guarantee wherever `appCheck` is set. Apps that
  configure `appCheck` only for client-side enforcement (no
  `clientEmail`/`privateKey`/`appId`) must now provide all three, or omit
  `appCheck` entirely to opt out of App Check.

## [0.6.25] - 2026-08-09

### Fixed

- Server-side `getAuthUser()` / `getAuthenticatedAppForUser` no longer fail with
  `auth/firebase-app-check-token-is-invalid` when App Check enforcement is
  turned on for Auth in the Firebase console. The client initialized App Check
  but never forwarded its token to the server, so `initializeServerApp` was
  always called without an `appCheckToken` and every RSC-side user lookup
  resolved to `null`. `AuthUserProvider` now mirrors the live App Check token
  into a client-readable cookie alongside the session cookie, and
  `getAuthenticatedAppForUser` reads it and passes it through. Apps without
  `appCheck` configured are unaffected — the cookie is simply absent and
  `initializeServerApp` skips App Check validation as before.

  The middleware's own token-refresh path is unaffected either way: it calls
  Google's Secure Token REST endpoint directly rather than going through the
  Firebase SDK, and App Check enforcement does not apply there.

  The App Check cookie above is written by `AuthUserProvider` (client) and is
  only ~1hr fresh — a cold navigation (fresh tab, hard refresh, external link)
  renders on the server BEFORE the client has had a chance to write it, even for
  a genuinely signed-in user, which reproduced the exact same rejection the
  cookie was meant to fix. `getAuthenticatedAppForUser` now falls back to
  minting an App Check token server-side (service-account custom-token exchange,
  `jose`-signed, Edge-runtime-safe — no `firebase-admin`) whenever the cookie is
  absent, closing that gap. This fallback only activates when
  `firebaseAuth.appCheck.clientEmail` / `privateKey` / `appId` are all
  configured; omit them to keep the cookie-or-nothing behavior above.

### Added

- `firebaseAuth.appCheckTokenCookieName` — App Check token cookie name. Defaults
  to `'__fa_app_check_token__'`.
- `firebaseAuth.appCheckTokenCookieMaxAge` — App Check token cookie max-age in
  seconds. Defaults to 1 hour (3600), matching the App Check token's own default
  lifetime so the cookie doesn't outlive the token it holds.
- `firebaseAuth.appCheck.clientEmail` / `privateKey` / `appId` — service account
  credentials (server-only, never sent to the client) enabling server-side App
  Check token minting as a fallback for the client cookie above. `jose` added as
  a new dependency for this.

## [0.6.24] - 2026-08-08

### Changed

- `stringifyUnknown` now logs a `console.warn` with the failure reason when
  resolving a function-wrapped error throws, instead of silently swallowing it.

## [0.6.23] - 2026-08-08

### Fixed

- `stringifyUnknown` now resolves function-wrapped error values on the client
  too (previously only on the server), falling back to `[Function]` only when
  resolution still yields a function or throws.

## [0.6.22] - 2026-08-08

### Changed

- `firebaseAuth.appCheck.debugToken` now also accepts a fixed UUID string (in
  addition to `true`), so local dev can reuse the same App Check debug token
  across restarts/builds instead of registering a new one every run.

## [0.6.21] - 2026-08-08

### Added

- `firebaseAuth.appCheck` config to enable Firebase App Check on the client
  (`getFirebaseAuthClient`). Supports `recaptchaV3SiteKey` or
  `recaptchaEnterpriseSiteKey`, plus a `debugToken` flag for local development
  (sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before init). Required if
  App Check enforcement is turned on in the Firebase console — otherwise every
  Auth/Firestore request gets rejected with 401.

## [0.6.20] - 2026-08-08

### Fixed

- `whiteListPaths` only matched a path exactly, so whitelisting a base route
  (e.g. `/bonds`) never covered its dynamic sub-routes (`/bonds/some-slug`) —
  both `intlMiddleware` and `AuthUserProvider` still bounced a signed-out
  visitor away from those sub-routes to `redirectAuthPath`. Matching now also
  accepts a whitelisted entry as a path-segment prefix (`/bonds` covers
  `/bonds/anything`, but not an unrelated sibling like `/bonds-extra`), applied
  identically in both the middleware and the client provider via a shared
  `isWhitelisted` helper.

## [0.6.19] - 2026-08-08

### Added

- `firebaseAuth` middleware forwarding for emailed Firebase action links.
  Firebase Console exposes only ONE project-wide action URL, so every email
  template (password reset, email verification, email recovery) lands on that
  same URL distinguished only by `?mode=`. `intlMiddleware` now reads that param
  and forwards the request — query string intact, so `oobCode`/`continueUrl`
  reach the destination — to a per-mode page, resolved BEFORE any guest/auth
  redirect so a signed-out user following the link doesn't get bounced to
  `redirectAuthPath` and lose their code.
  - `resetPasswordPath` (default `'/reset-password'`) and `recoverEmailPath`
    (unhandled if omitted) join the existing `verifyEmailPath` as per-mode
    targets.
  - `actionModePaths` accepts arbitrary `mode` → path overrides for modes with
    no dedicated field (e.g. `verifyAndChangeEmail`), or to redirect a known
    mode elsewhere.
  - `actionLinkPath` restricts the forward to one exact static path (e.g.
    `'/auth/action'`), matching a Firebase Console action URL pinned to a path
    rather than the bare domain root. Omit to match any path carrying `?mode=`
    (Firebase's bare-domain-root default).
  - `actionLinkRedirectEnabled: false` disables the forward entirely.
  - All new path fields (`resetPasswordPath`, `recoverEmailPath`,
    `actionLinkPath`) get the same leading-`/` auto-correction as
    `redirectAuthPath`/`homePath`/`verifyEmailPath`.

## [0.6.18] - 2026-08-08

### Fixed

- `CookieConsentProvider` seeded `consent: true` for a first-time visitor
  whenever `requiresConsent` was `false` (visitor outside `gdprCountries`, or
  dev mode), instead of leaving it `null`. This conflated "consent not required"
  with "visitor explicitly accepted," so any UI keyed off `consent !== null`
  (e.g. a "cookie settings" reset button) incorrectly showed for visitors who
  never made a choice. `consent` now only ever reflects a real, stored decision.
  Added `requiresConsent` to `useCookieConsent()`'s return value so consumers
  can tell "not required" apart from "decided" directly; `CookieConsentDialog`
  and `CookieConsentAnalytics` now check it explicitly (banner stays hidden and
  analytics unlock immediately when `requiresConsent` is `false`, same end-user
  behavior as before — only the underlying `consent` value changed).

**Breaking:** `useCookieConsent()`'s return type gained a required
`requiresConsent: boolean` field. If you mock/type this hook's return value
directly in tests, add `requiresConsent`.

## [0.6.17] - 2026-08-07

### Changed

- **Breaking:** `IntlProvider`'s `staticSafe` prop now defaults to `true` (was
  `false`). Existing `IntlProvider` calls that relied on the implicit default to
  seed `initialAuthUser`/perform the pre-render auth redirect must now pass
  `staticSafe: false` explicitly to keep that behavior. Projects using the
  default middleware wiring (`firebaseAuth.middlewareEnabled !== false`) are
  unaffected from a security standpoint — the redirect was already redundant
  with `intlMiddleware`'s `update_session` step — but will see a signed-in
  user's nav/account UI resolve client-side after mount instead of on first
  paint unless `staticSafe: false` is set. Projects with
  `firebaseAuth.middlewareEnabled: false` MUST pass `staticSafe: false` on every
  `IntlProvider` call, since that component was the only place performing the
  auth redirect; a `console.warn` fires if this combination is left unset.

## [0.6.15] - 2026-08-06

### Added

- `IntlProvider` now accepts a `staticSafe` prop (default `false`,
  non-breaking). When `firebaseAuth` is configured, `IntlProvider` normally
  calls `resolveAuthUserAndRedirect()`, which reads `cookies()` (session cookie)
  and `headers()` (`x-pathname`) to seed `initialAuthUser` and perform a
  pre-render auth redirect. Both are request-scoped APIs, so calling either
  forces the ENTIRE subtree under that `IntlProvider` to render dynamically — no
  static rendering, no ISR — for every route nested under it, including routes
  listed in `firebaseAuth.whiteListPaths`, since the whitelist check itself only
  runs after `cookies()`/`headers()` are already read. On projects using the
  default middleware wiring (`firebaseAuth.middlewareEnabled !== false`), that
  redirect is redundant: `intlMiddleware`'s `update_session` step already
  validates the session JWT (refreshing it if needed) and performs the exact
  same guest/auth-page redirects, authoritatively, before `IntlProvider` ever
  runs. Setting `staticSafe: true` skips the redundant call, letting that route
  render statically/ISR again; the only cost is `initialAuthUser` no longer
  being seeded server-side, so a signed-in user may see the route's
  logged-out-state UI for one client render before `AuthUserProvider` catches up
  — never wrong/protected content, since middleware already gated that. Passing
  `staticSafe: true` while `firebaseAuth.middlewareEnabled` is explicitly
  `false` logs a `console.warn`, since in that configuration `IntlProvider`'s
  own redirect is the _only_ auth check in the app and skipping it is a real
  security regression, not just a render-flash tradeoff. See the `staticSafe`
  JSDoc on `IntlProvider` (`package/src/server/components/server_provider.tsx`)
  for full guidance on when to use it.

## [0.6.12] - 2026-08-05

### Fixed

- `AuthUserProvider`'s client-side redirect effect had no handling at all for
  "signed-in user lands on an auth page" (`isAuthPage`) — it short-circuited
  (`if (loading || isAuthPage || isWhiteListed) return;`) before ever reaching
  that case. Only the middleware (`update_session.ts`, server-side) redirected a
  signed-in user away from an auth page like `/login`; a client-side navigation
  to that page (e.g. a `<Link>`) never re-runs the middleware, so the user would
  land there while already signed in and stay put until a hard refresh. Added
  the matching redirect-to-`homePath` branch client-side.
- Both `update_session.ts` and the new client-side branch above checked
  `isAuthPage` before the unverified-email check, so a signed-in-but-unverified
  user landing on an auth page was sent to `homePath` instead of
  `verifyEmailPath` — reachable a page they shouldn't be on yet either.
  Reordered both to check unverified-email first in every case.
- Neither `update_session.ts` nor the client-side effect ever redirected a
  VERIFIED signed-in user away from `verifyEmailPath` itself — a verified user
  could navigate there directly and just stay, with nothing sending them home.
  Added the matching redirect-to-`homePath` on both sides, guarded to only fire
  when the user is actually verified (an unverified user on that page is still
  correctly left alone).

## [0.6.13] - 2026-08-05

### Fixed

- The verified-user-on-`verifyEmailPath` fix in 0.6.12 initially checked
  `email_verified !== false` in `update_session.ts` (treating a
  missing/undefined claim as verified), while `AuthUserProvider`'s client effect
  checks the live SDK's boolean `user.emailVerified` strictly — a token whose
  claim was merely absent (not explicitly `false`) hit an infinite redirect loop
  directly on `verifyEmailPath` (browser: "The page isn't redirecting
  properly"), because the server sent the user home while the client immediately
  bounced them back. Tightened the server check to require an explicit
  `email_verified === true`, matching the client's strict boolean check.

## [0.6.14] - 2026-08-05

### Added

- `setIntlConfig` now validates
  `firebaseAuth.redirectAuthPath`/`homePath`/`verifyEmailPath` and auto-corrects
  a missing leading `/` (with a `console.warn`), instead of silently accepting
  it. Every path this package compares against `request.nextUrl.pathname`
  expects a leading slash; a config like `redirectAuthPath: 'login'` (a real,
  observed typo) made the path comparison never match, silently disabling that
  redirect/exemption — most severely, an infinite redirect loop directly on
  `verifyEmailPath` when it never matched its own page, since none of the
  "already on this page" exemptions the middleware/client rely on could ever
  trigger.
- `firebaseAuth.onSignIn`/`onEmailVerified`/`onSignOut` — optional callbacks on
  the `firebaseAuth` config, invoked by `AuthUserProvider` exactly once per real
  auth-lifecycle transition (not on routine token refreshes or repeated
  observations of an already-settled state). Lets consumer apps hook
  cleanup/side-effect logic — e.g. clearing per-account `localStorage` state on
  sign-out — without re-deriving the transition from raw `onIdTokenChanged`
  callbacks or duplicating `AuthUserProvider`'s own debounce logic. A
  throwing/rejecting callback is caught and logged via `console.error`; it never
  blocks cookie sync or navigation. See
  `docs/superpowers/specs/2026-08-05-auth-lifecycle-callbacks-design.md` for the
  full design.

## [0.6.11] - 2026-08-05

### Fixed

- Firebase's `reload(user)` can report `emailVerified: true` from the profile
  API before Google's Secure Token API has propagated that same change into
  freshly-minted ID tokens — a real, observed case where a user verified via an
  emailed link (out-of-band, in a separate tab) still triggered
  `verifyEmailPath` redirect loops even after the 0.6.9/0.6.10 hint-cookie fix,
  because `AuthUserProvider`'s `reloadUser()` wrote a session cookie whose
  `email_verified` claim was still stuck `false` despite the reload already
  confirming `true`. `reloadUser` now compares the freshly-minted token's `iat`
  (issued-at) against the cookie it's about to replace, and retries
  `getIdToken(true)` up to 3 times (with a short wait) until it gets a token
  that's actually newer, before writing the session cookie — instead of trusting
  whatever `getIdToken(true)` returns on the first call.

### Changed

- Extracted `decodeJwtPayload` (previously private to `update_session.ts`) into
  its own isomorphic `src/firebase_auth/decode_jwt_payload.ts`, now shared by
  both `update_session.ts` (Edge middleware) and the new retry logic in
  `auth_user_provider.tsx` (client), instead of duplicating the decode logic.
- `decodeJwtPayload` now extracts `exp`/`iat`/`email_verified` via targeted
  regex over the decoded JSON text instead of a full `JSON.parse` — ~1.9x faster
  on a realistic Firebase ID token payload (benchmarked in the new
  `decode_jwt_payload.bench.ts`), which matters since it runs on every Edge
  middleware invocation with a session cookie. Safe only because these three
  claims are top-level, standard JWT/Firebase registered claims that Firebase's
  ID tokens never nest under another key; documented directly in the function's
  doc comment and covered by a test.

## [0.6.10] - 2026-08-04

### Changed

- Tightened `emailVerifiedHintCookieName`'s trust condition (introduced in
  0.6.9): a forced refresh before trusting a stale `email_verified: false` claim
  is now skipped ONLY when the hint cookie is present and explicitly `'false'` —
  a positive, current confirmation the claim still holds. A hint of `'true'`, or
  one that's missing/expired, now also triggers the refresh (previously only
  `'true'` did; "absent" incorrectly skipped it). `AuthUserProvider` also now
  writes the hint as `'false'` on sign-out instead of clearing it — signed-out
  is a confirmed non-verified state, not "unknown," and clearing it would
  otherwise force a needless refresh if a stale session cookie somehow still
  lingered.

## [0.6.9] - 2026-08-04

### Fixed

- `update_session.ts`'s `verifyEmailPath` redirect (added in 0.6.8) could
  infinite-loop: the session cookie's `email_verified` claim only updates when
  the ID token naturally refreshes (up to ~1hr), so a consumer page doing its
  own live verification check (e.g. via `getAuthUser()`, fresh every request)
  could already see the email as verified while the cookie's claim still said
  `false`. If that page then redirected a verified user elsewhere, the next
  request re-read the same stale cookie and bounced right back to
  `verifyEmailPath` — repeating forever. `AuthUserProvider` (client) now mirrors
  the live SDK's `emailVerified` state into a new `emailVerifiedHintCookieName`
  cookie (default `__fa_email_verified_hint__`, non-httpOnly, no secret) on
  every auth-state change. `update_session.ts` force-refreshes the ID token
  before trusting a `false` claim unless this hint cookie agrees, so a genuinely
  unverified user doesn't pay a refresh on every request while a live-verified
  user isn't stuck behind a stale claim.

## [0.6.8] - 2026-08-04

### Fixed

- `firebaseAuth.verifyEmailPath` was accepted by config but never read by the
  middleware — signed-in users with an unverified email were never redirected to
  it. `update_session.ts` now decodes the session token's `email_verified` claim
  and redirects to `verifyEmailPath` when it's explicitly `false`, skipping the
  redirect on the verify-email page itself, on auth pages, and when
  `verifyEmailPath` is unset.
- The default-locale prefix check in `update_session.ts` compared `locale`
  against `config.locales[0]` instead of `config.defaultLocale`. When `locales`
  didn't list the default locale first (e.g. `locales: ['uk', 'en']`,
  `defaultLocale: 'en'`), every auth redirect for the default locale
  (`redirectAuthPath`, `homePath`, `verifyEmailPath`) incorrectly kept the `/en`
  prefix instead of using the unprefixed path.

## [0.6.7] - 2026-08-04

### Fixed

- Fixed an infinite console-error reporting loop when
  `errorHandling.overrideConsoleError` is `true`: `reportError`'s own
  console-logging step (its always-on log, and its onError-threw fallback) could
  call `console.error` again after the override patched it, which routed
  straight back into another `reportError` call — an infinite loop in practice,
  since Next.js's own dev-mode console interception forwards through whatever
  `console.error` is CURRENT at call time rather than the function it originally
  wrapped, defeating a "capture the original once" guard.
  `installConsoleErrorOverride` now sets an internal flag
  (`consoleOverrideState` in `report_error.ts`) when it installs; `reportError`
  checks it and skips its own console-logging step entirely while the override
  is active, since the override already logged the raw call before invoking
  `reportError`. This removes the second caller instead of trying to detect and
  filter out a recursive one.

## [0.6.6] - 2026-08-03

### Added

- `installGlobalErrorOverride`
  (`cloudflare-next-intl/installGlobalErrorOverride`): client-only
  `window.addEventListener('error'|'unhandledrejection', ...)` handlers routed
  through `errorHandling.onError`/`reportError`, the same way
  `installConsoleErrorOverride` does for `console.error(...)` calls — catches
  uncaught exceptions and unhandled promise rejections that never go through
  `console.error` at all, e.g. Next.js's own internal "Failed to fetch RSC
  payload" navigation-fallback error. Auto-wired into `IntlProvider`'s client
  provider. Controlled by the new `errorHandling.overrideWindowErrors`, which
  defaults to `overrideConsoleError`'s value — setting
  `overrideConsoleError: true` alone now catches both console errors and
  uncaught window errors; pass `overrideWindowErrors: false` explicitly to opt
  out of just the window listeners.

## [0.6.5] - 2026-08-03

### Fixed

- `AuthUserProvider`'s client-side `onIdTokenChanged` listener now clears the
  server's httpOnly session/refresh cookies (via `clearSessionAction`) whenever
  it observes a signed-out state, not only when `logout()` is called.
  Previously, if the client Firebase SDK reported signed-out (e.g. no persisted
  session) while a valid server-issued session cookie still existed, the cookie
  could never be cleared — `document.cookie` cannot touch httpOnly cookies —
  leaving the server treating the visitor as signed-in indefinitely.
- Extracted the duplicated cookie-clear/cookie-write logic in `AuthUserProvider`
  into shared `clearSession`/`writeSession` helpers, used by `logout()`, the
  sign-in/out listener, and `reloadUser`.

## [0.6.4] - 2026-08-02

### Fixed

- `createServerErrorAction` no longer has its own `"use server"` directive —
  Next.js requires every top-level export of a `"use server"` file to be an
  async function directly, and a factory that _returns_ one doesn't qualify
  (`Server Actions must be async functions.`). Put `"use server"` in your OWN
  file that calls `createServerErrorAction` and re-exports its result instead —
  see the updated usage example in its doc comment.

## [0.6.3] - 2026-08-02

### Added

- `createServerErrorAction(config)` (`cloudflare-next-intl/errorHandling`'s
  `createServerErrorAction` subpath) — creates a `"use server"` action that
  reports a client-originated error via `reportError`, so server-only config
  (secrets your `onError` reads, etc.) never has to be imported into client-side
  code. Call once, server-side, and pass the returned
  `(error, classOrMethodName, params?)` function to client components.
  Stringifies the error before it crosses the client→server action boundary and
  sets `isClient: true` automatically.

## [0.6.2] - 2026-08-02

### Added

- `reportError` now supports a "reset-only" call: passing `params.error` as
  `null`/`undefined` together with `errorHandling.resetDedup: true` clears the
  dedup state and returns immediately, without calling `onError`. Use this once
  at the very start of a request/cron tick — before any handler that might call
  `reportError` for a real error runs — in a long-lived server process where
  dedup state must not leak across requests.

## [0.6.1] - 2026-08-02

### Added

- `reportError` now dedups by default: an error whose key
  (`classOrMethodName`/`error`/`params`, or an explicit
  `ErrorHandlingParams.dedupKey`) matches the immediately preceding reported
  error's key within a throttle window is skipped. New
  `ErrorHandlingRoutingConfig` fields: `dedup?: boolean` (default `true`),
  `throttleMs?: number` (default `5000`), `resetDedup?: boolean` (pass `true` on
  the first `reportError` call of each request/cron tick in a long-lived server
  process to clear the dedup state — otherwise one request's errors can suppress
  another's).

### Changed

- `installConsoleErrorOverride` no longer has its own separate report cap —
  dedup/throttling is now entirely `reportError`'s responsibility (see above).
- `reportError`'s `waitUntil` backgrounding calls `callOnError(...)` directly
  again (no `Promise.resolve().then()` indirection) — `waitUntil` must be called
  synchronously, in the same tick, or Cloudflare Workers may tear down the
  request before it's ever registered.

## [0.6.0] - 2026-08-02

### Added

- New `error_handling` submodule (`cloudflare-next-intl/errorHandling`, plus
  `installConsoleErrorOverride`, `stringifyUnknown`, `formatErrorMessage`,
  `defaultIgnoredConsoleErrors` subpaths):
  - `reportError(config, params)` / `withErrorHandling(fn, name, options)` —
    report a caught error via `errorHandling.onError` (default `console.error`),
    then (for `withErrorHandling`) rethrow. Gated by `errorHandling.enable`
    (default `true`) and by `params.consent` (skips reporting when consent isn't
    `true`, since sending error reports to a third party without consent can
    itself be GDPR-relevant).
  - `RoutingConfig.generate.getCloudflareContext` — moved from
    `cookieConsent.getCloudflareContext` (still consulted the same way by
    `cookieConsent`'s GDPR gating); now also used by `reportError` to background
    reports via `ctx.waitUntil` when available.
  - `installConsoleErrorOverride` — opt-in
    (`errorHandling.overrideConsoleError`) global `console.error` override
    routing every call through `reportError` (original `console.error` still
    runs). Capped at 20 reports per install to guard against a render-error
    loop. Auto-installed by `IntlProvider` (server) and the client provider.
  - `errorHandling.ignoreConsoleErrors` (substring array, defaults to
    `defaultIgnoredConsoleErrors` — this package's own Firebase Auth codes for
    expected user-input failures like wrong password/email-already-in-use) and
    `ignoreConsoleError` (custom predicate) — both skip reporting a matching
    `console.error` call while still logging it normally.
  - `ErrorHandlingParams.formattedMessage` — a readable one-line
    `[classOrMethodName] Error: <message>` summary (plus non-empty
    `Params`/client-origin sections), always populated by `reportError` before
    calling `onError`/the default `console.error`.
  - Wired internally into `cookieConsent`'s GDPR country resolution, the
    Firebase server auth lookup, and `cookieConsent.getAnalytics()` (which
    previously had no error handling at all).

### Changed

- **Breaking:** `cookieConsent.getCloudflareContext` moved to
  `generate.getCloudflareContext` on `RoutingConfig` — update your config if you
  were passing it under `cookieConsent`.

## [0.5.7] - 2026-08-02

### Changed

- `useCookieConsent().setConsent` now also accepts `null` — resets the stored
  consent decision so the `CookieConsentDialog` banner reappears (e.g. for a
  "cookie settings" button), and survives a refresh before the visitor
  re-decides: it isn't re-seeded back to `true` by the auto-accept path even
  when `requiresConsent` is `false` (e.g. always the case in dev).

## [0.5.6] - 2026-08-02

### Changed

- Renamed `cookieConsent.secrets`/`getSecrets`/`CookieConsentAnalyticsSecrets`
  to `analytics`/`getAnalytics`/`CookieConsentAnalyticsConfig` (and the
  `analyticsSecrets` prop to `analyticsConfig`) to better reflect that these
  aren't always secret values (e.g. GA measurement IDs).

## [0.5.5] - 2026-08-02

### Added

- `CookieConsentProvider` now auto-acknowledges the privacy-policy-update banner
  (`privacyPolicyUpdated` → `false`) when the visitor navigates to
  `cookieConsent.privacyPolicyPath` — no dedicated component needed, matches by
  pathname internally. Skipped when `privacyPolicyPath` is `false`.

## [0.5.4] - 2026-08-02

### Fixed

- `CookieConsentDialog`/`PrivacyPolicyUpdateDialog` now render through a
  `document.body` portal instead of inline in the app tree. Previously a host
  app's own stacking context (any ancestor with `transform`/`filter`/
  `opacity`/`isolation`, common in dashboard shells with sidebars/panels) could
  trap the dialog behind other UI no matter how high its `z-index` was set — a
  `z-index` only wins within its own stacking context. Also bumped the default
  `z-index` to the CSS max (`2147483647`) so the dialogs win against any host
  z-index once escaped into `body`.

## [0.5.3] - 2026-08-02

### Added

- `IntlProvider` now auto-renders `CookieConsentDialog` and
  `PrivacyPolicyUpdateDialog` whenever `cookieConsent` is configured — no more
  manually adding them to your layout. New `cookieConsent.autoWireDialogs`
  (default `true`) opts out to render them yourself; new
  `cookieConsent.dialogProps`/`updateDialogProps` forward props to the
  auto-wired dialogs (e.g. custom text/`classNames`/`styles`) without needing to
  render them by hand. Exported `CookieConsentDialogProps`/
  `PrivacyPolicyUpdateDialogProps` from `cloudflare-next-intl/cookieConsent` for
  typing those objects.

### Migration

Manually rendering the dialogs in your layout now double-renders them — remove
the JSX:

```diff
 <IntlProvider language={locale}>
   {children}
-  <CookieConsentDialog />
-  <PrivacyPolicyUpdateDialog />
 </IntlProvider>
```

Set `cookieConsent.autoWireDialogs: false` to keep rendering them yourself.

## [0.5.2] - 2026-08-02

### Fixed

- `CookieConsentProvider`'s `consent` (and derived `privacyPolicyUpdated`) state
  used to resolve only inside a client-only `useEffect`, so
  `CookieConsentDialog`/`PrivacyPolicyUpdateDialog` briefly rendered with
  `consent = null` on first paint before the effect corrected it — a visible
  "flash" of the cookie banner for returning visitors who had already decided.
  Added `isMounted` to `CookieConsentContextType`, set once the effect has read
  the stored cookies; both default dialog components now render `null` until
  `isMounted` is `true`, removing the flash entirely.

## [0.5.1] - 2026-08-02

### Added

- `CookieConsentDialog` and `PrivacyPolicyUpdateDialog` now ship default styling
  (Tailwind classes) and default English/Ukrainian copy, so both render a
  usable, styled banner out of the box with zero props. Passing
  `message`/`acceptText`/`declineText`/`closeText`/`classNames`/`styles` still
  overrides the defaults per slot as before.

## [0.5.0] - 2026-08-02

### Fixed

- `cookieConsent.getCloudflareContext`-based country resolution
  (`resolveRequiresConsent`, added in 0.4.0's GDPR gating) is now skipped under
  `next dev` (`NODE_ENV === 'development'`), failing safe to
  `requiresConsent = true` instead. Calling `getCloudflareContext` from
  `IntlProvider` on every request could crash the local `next dev` +
  `initOpenNextCloudflareForDev` Cloudflare dev shim with a native workerd RPC
  panic ("Failed to get handler to worker") — a known upstream limitation of
  `getPlatformProxy` with Durable Object / service bindings (see
  cloudflare/workers-sdk#8687) that no `try`/`catch` in JS can prevent, since it
  isn't a catchable JS exception. `cookieConsent.getCountryCode`
  (caller-supplied) is unaffected and still runs in dev.

### Changed (BREAKING)

- `resolveRequiresConsent` now requires consent by default (`true`) when
  **neither** `getCountryCode` nor `getCloudflareContext` is set, instead of
  treating that as "gating off" (`false`). Rationale: without either getter the
  visitor's country genuinely can't be determined, and the package's documented
  fail-safe policy elsewhere is "unknown country still requires consent" —
  omitting both getters is now consistent with that, rather than a silent
  exception. If you rely on the old "no getters → banner never shown" behavior,
  set `autoWireAnalytics: false` or handle the banner yourself via
  `useCookieConsent()`/`CookieConsentDialog`.

## [0.4.6] - 2026-08-02

### Changed

- `@microsoft/clarity` moved from an optional `peerDependency` to a real
  `dependency`. Its `import('@microsoft/clarity')` is a literal specifier that
  webpack/Turbopack resolve at build time for every reachable module regardless
  of runtime branching (even behind `next/dynamic`) — no bundler-side trick
  makes that install truly optional, so every consumer now gets it installed
  automatically instead of hitting a build error. The import itself is still
  isolated in its own module (`clarity_script.tsx`), loaded via `next/dynamic`,
  so the code only ships as a separate chunk that's fetched at runtime once
  consent is granted and `secrets.clarityProjectId` is set.

## [0.4.4] - 2026-08-02

### Added

- `cookieConsent.privacyPolicyPath` (defaults to `'/privacy-policy'`; set
  `false` to disable) — `CookieConsentDialog`/`PrivacyPolicyUpdateDialog` now
  render a default, locale-prefixed privacy-policy link automatically when their
  `link` prop is omitted, instead of requiring a hardcoded link element every
  time. Pass `link={null}` to render no link for a single dialog, or your own
  element to override it. New `privacyPolicyLinkText` prop overrides the default
  link's label (`"Privacy Policy"` / `"Learn more"`). Exposed on
  `useCookieConsent()` as `privacyPolicyPath`.

## [0.4.3] - 2026-08-02

### Fixed

- `CookieConsentCloudflareContext.cf` was typed as `{ country?: string }`, which
  isn't structurally assignable from `@opennextjs/cloudflare`'s real `cf` type
  (`CfProperties`, a union of the incoming-request and request-init variants —
  `country` only exists on one branch). This made
  `getCloudflareContext: getCloudflareContext` (passed directly, per 0.4.2) fail
  to type-check. `cf` is now typed as `Record<string, unknown>`;
  `resolveRequiresConsent` reads `country` defensively at the call site.

## [0.4.2] - 2026-08-02

### Changed

- `cookieConsent.getCloudflareContext` now types as
  `CookieConsentGetCloudflareContext`, matching `@opennextjs/cloudflare`'s exact
  overloaded `getCloudflareContext` signature — pass that function directly (no
  wrapping closure needed); it's called internally with `{ async: true }`. Also
  now accepts a `null` resolved context (treated as an unresolved country, so
  consent is still required).

## [0.4.1] - 2026-08-02

### Added

- Country-based cookie-consent gating: `cookieConsent.getCountryCode` and
  `cookieConsent.getCloudflareContext` let visitors outside `gdprCountries`
  (defaults to EU/EEA + UK + Switzerland) skip the consent banner entirely, with
  consent seeded to implicitly granted. `getCountryCode` takes precedence over
  `getCloudflareContext` when both are set. Neither set (the default) disables
  country-based gating — consent is never required. A country that can't be
  resolved always requires consent (fail-safe).
- `cookieConsent.enableAnalyticsInDevMode` (defaults to `false`) — auto-wired
  analytics stay off in local development (`NODE_ENV === 'development'`)
  regardless of consent/country, unless explicitly enabled.
- `src/cookie_consent/gdpr_countries.ts` — `defaultGdprCountries` and
  `resolveRequiresConsent`, exported from `./cookieConsent`. Country lookups use
  a cached `Set` (O(1)) instead of `Array.includes()`.

### Changed

- `CookieConsentProvider` accepts `requiresConsent` (defaults to `true`),
  auto-passed by `IntlProvider` from the resolved country-gating result.

## [0.4.0] - 2026-08-02

### Added

- `cookie_consent` module: optional cookie-consent + privacy-policy-update
  banner, config-gated via `cookieConsent` on `RoutingConfig`. New subpaths:
  `./cookieConsent`, `./CookieConsentProvider`, `./useCookieConsent`,
  `./CookieConsentDialog`, `./PrivacyPolicyUpdateDialog`,
  `./cookieConsentAnalytics`.
- `IntlProvider` auto-wires `CookieConsentProvider` (and, when
  `cookieConsent.secrets`/`getSecrets` is set, `CookieConsentAnalytics`)
  whenever `cookieConsent` is configured — no manual provider nesting required.
- `CookieConsentAnalytics` gates Cloudflare Web Analytics, Google Ads, Google
  Analytics, AdSense, and Microsoft Clarity behind visitor consent.
- `src/cookie_consent/README.md` — module-level docs (layout, auto-wiring,
  customization, gotchas).

## [0.3.3] - 2026-08-02

### Fixed

- `AuthUserProvider`'s session-cookie sync now happens via a `'use server'`
  Server Action (`next/headers`'s `cookies().set(...)`, `httpOnly: true`)
  instead of a client-side `document.cookie` write. A client write can never
  carry `httpOnly` and is invisible to the server until the next natural request
  — this mismatch was the underlying reason the 0.3.2 fixes below didn't fully
  resolve the flash in practice.
- `LocationzationClientProvider` no longer calls `next/dynamic`'s `dynamic()`
  inside its render body. Calling `dynamic()` per-render creates a brand new
  component identity every time, forcing React to unmount/remount
  `AuthUserProvider` on every render instead of reusing the existing instance —
  each remount re-subscribed `onIdTokenChanged`, which Firebase immediately
  replayed with the current user, triggering a forced token refresh and another
  render: an infinite loop of session-cookie writes, one per render (visible as
  `POST /<page>` firing every second or two). `dynamic()` is now called once at
  module scope.
- Reverted two 0.3.2 changes that turned out to be based on an incorrect read of
  a dead, unused reference implementation rather than the actual proven-working
  code: `resolveAuthUser` is renamed back to `resolveAuthUserAndRedirect` and
  performs its authoritative redirect again (middleware only checks cookie
  _presence_, not validity — a forged/expired/invalid-but-present cookie needs
  this RSC-layer check to catch it), and `AuthUserProvider`'s
  `confirmedSignedOut` again initializes from `initialUser === null` rather than
  always `false`.

## [0.3.2] - 2026-08-02

### Fixed

- `firebase_auth` middleware no longer signs a user out on a transient
  session-refresh failure (network blip, Google 5xx, timeout). Previously any
  failure to refresh the ID token — including ones unrelated to the refresh
  token's validity — cleared the refresh-token cookie and redirected to the auth
  page; since the client SDK's own session is independent of these cookies, this
  produced a visible flash to the login page followed by an immediate bounce
  back home. Only Google's explicit "this refresh token is invalid" error codes
  (`INVALID_REFRESH_TOKEN`, `TOKEN_EXPIRED`, `USER_DISABLED`, `USER_NOT_FOUND`)
  now trigger sign-out; every other failure passes the request through untouched
  instead of guessing.

### Added

- `sessionCookieName`/`refreshTokenCookieName` on `FirebaseAuthRoutingConfig` —
  override the cookie names `firebase_auth`'s middleware, client provider, and
  server helpers read/write (default: `__fa_session__`/ `__fa_refresh_token__`),
  for apps that already use different cookie names for their Firebase session.

## [0.3.1] - 2026-08-02

### Added

- `./getFirebaseAuthUser` subpath: unconditional, server-only `getAuthUser()`
  export, same style as `getLocale`/`getTranslations` — always types as `async`
  in editors, unlike `useFirebaseAuthUser`'s `react-server` condition (which
  TypeScript can't evaluate, so it always shows that subpath's client/sync
  signature regardless of call site).

## [0.3.0] - 2026-08-01

### Added

- `firebase_auth` module: optional Firebase Authentication integration,
  config-gated via `firebaseAuth` on `RoutingConfig`. New subpaths:
  `./firebaseAuthClient`, `./firebaseAuthClientProvider`,
  `./firebaseAuthServerProvider`, `./useFirebaseAuthUser`,
  `./firebaseAuthActions`, `./firebaseAuthMiddleware`.
- `llms.txt` at the package root — machine-readable map of every subpath, its
  purpose, and package-wide conventions/gotchas.
- `src/config/README.md` and `src/firebase_auth/README.md` — module-level docs
  for the two areas requiring setup a consumer must know before use.
- Performance benchmark suite (`vitest bench`).
- `@example` blocks on `useLocale`, `useTranslations`, `useAuthUser`, and the
  three `firebaseAuthActions` factories.

### Changed

- `intlMiddleware`'s Edge session-refresh path now caches successful Firebase
  refresh-token exchanges (Cloudflare Workers `caches.default`), cutting
  redundant round-trips to Google's Secure Token API.
- Error message for a missing `@intl-config` alias now names the alias, the file
  to create, and the README section to follow instead of a generic "set config
  file" message.
- `useLocale`/`useTranslations` throw the same wording on both the Server
  Component and Client Component implementations
  (`"... must be used within an IntlProvider"`).
- `setCookieClient`'s `value` param narrowed from `unknown` to
  `string | number | boolean`.

### Removed

- `./getLayoutStates` subpath and its dead implementation
  (`src/general/get_layout_states.ts`) — was already fully commented out and
  exported nothing at runtime.

## [0.2.2] and earlier

Not tracked in this file. See git history prior to `1f5d2ee`.

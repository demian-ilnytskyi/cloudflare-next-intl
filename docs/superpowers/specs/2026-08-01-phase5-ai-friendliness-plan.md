# Phase 5: AI-Friendliness Plan

Investigation-only deliverable per
`2026-08-01-phase4-ai-friendliness-design.md`. **No code changes made.**
Flagged for user approval before any implementation phase.

Scope: every `package.json` `exports` entry (24 subpaths, 26 resolved files
counting the two conditional `react-server`/`default` pairs for `./use` and
`./useFirebaseAuthUser`), plus `types.ts`, `intl_config.ts`,
`require_config.ts`, README.md, and `.agent/.sub-rules/packages/**`.

Rubric (1–5 each, see design spec): **Sig** = signature self-sufficiency,
**Err** = error actionability, **Ex** = example coverage, **Name** = naming
consistency, **Disc** = discoverability without a build step.

## Per-file rubric scoring

| Subpath | File | Sig | Err | Ex | Name | Disc | Notes |
|---|---|---|---|---|---|---|---|
| `.` | `src/index.ts` | 3 | n/a | 2 | 4 | 2 | Barrel re-exporting 6 sub-barrels including `types`; no top-level doc comment explaining this is a "everything" import vs. the flat subpaths being the intended granular imports. |
| `./client` | `src/client/index.ts` | 4 | n/a | 3 | 4 | 3 | Clean 1-line re-exports; commented-out `useLocale`/`useTranslations` line (dead export) with no comment explaining why it's commented — an agent grepping this barrel will wonder if it's a bug. |
| `./server` | `src/server/index.ts` | 4 | n/a | 3 | 4 | 3 | Same commented-out-line issue for the server `use_functions` export. |
| `./middleware` | `src/config/middleware.ts` | 4 | 3 | 4 | 4 | 5 | Strong JSDoc incl. `runHandlerOnRedirect` default; catch-all try/catch logs but returns silent `NextResponse.next()` on error — an agent debugging "middleware isn't working" gets nothing actionable from the runtime error path itself (only a console.error). |
| `./setIntlConfig` | `src/config/init_config.ts` | 5 | n/a | 5 | 5 | 5 | Exemplary: full JSDoc, `@example`, explains identity-function-for-inference design. Reference quality. |
| `./serverProvider` | `src/server/components/server_provider.tsx` | 4 | 3 | 5 | 4 | 4 | Good JSDoc/example. `language` param is bare `string`, not narrowed to `AppLocales` — an agent can pass any string and only discover the mistake at runtime via `notFound()` (no error message, just a 404). |
| `./Link` | `src/server/components/link.tsx` | 4 | n/a | 5 | 4 | 4 | Good JSDoc distinguishing from `LocaleLink`. `href` typed as `Url` from `next/link`, fine. |
| `./IntlHelperScript` | `src/server/components/helper_script.tsx` | 4 | n/a | 4 | 4 | 4 | Good top-level doc; the injected inline `<script>` JS itself is unreachable to any type/lint checking and has its own internal JSDoc (a nice touch, but only visible if an agent reads past the outer function). |
| `./LocaleLink` | `src/client/components/locale_link.tsx` | 5 | n/a | 5 | 5 | 4 | Strong; explicit `locale: string` required prop, clear JSDoc contrasting with `Link`. |
| `./usePathname` | `src/client/hooks/use_path_name.ts` | 4 | 2 | 3 | 4 | 4 | Good JSDoc. No runtime guard/error if used outside `IntlProvider` — relies transitively on `useLocale`'s throw, but that throw's message doesn't mention `usePathname` at all, so the stack surfaces a confusing "must be used within a LocaleContext" error attributed to the wrong call site conceptually. |
| `./metadata` | `src/general/metadata.ts` | 4 | 2 | 5 | 4 | 4 | Strong JSDoc/example. Swallows internal errors and returns `undefined` silently (only `console.error`s) — an agent whose metadata silently vanishes gets no thrown, catchable signal. |
| `./getLayoutStates` | `src/general/get_layout_states.ts` | 1 | 1 | 1 | n/a | 1 | Entire file is commented out; exports **nothing** at runtime despite being a live `exports` entry. An agent importing it gets a confusing "not a function"/undefined error with zero indication this is intentional dead code — the explanatory comment is in the source file, invisible from `dist/` or the type declaration a consumer's editor shows. **Worst-scoring file in the surface.** |
| `./setCookieClient` | `src/client/functions/set_cookie.ts` | 4 | 3 | 3 | 5 | 4 | Clear JSDoc distinguishing from package-internal cookies. `value: unknown` param is looser than needed (only ever template-literal-stringified) — should be `string \| number \| boolean` or similar to signal "must be stringifiable, no encoding applied." |
| `./getCookieClient` | `src/client/functions/get_cookie.ts` | 5 | 3 | 3 | 5 | 4 | Clean, pairs correctly with `setCookieClient` via `@link`. |
| `./localeStaticParams` | `src/server/functions/locale_static_params.tsx` | 5 | n/a | 5 | 5 | 4 | Simple, well-documented, `@example` present. File extension is `.tsx` despite containing no JSX — minor discoverability wrinkle (an agent grepping `*.ts` for pure-logic files would miss it). |
| `./use` (react-server) | `src/server/functions/use_functions.ts` | 4 | 4 | 3 | **2** | 4 | Good JSDoc/throws. **Naming/message inconsistency**: throws `'Please set IntlProvider before using useLocale'` / `'...useTranslations'`. |
| `./use` (default) | `src/client/hooks/client_hooks.ts` | 4 | 4 | 2 | **2** | 4 | Throws `'useLocale must be used within a LocaleContext'` / `'useTranslations must be used within a LocaleContext'` — **different wording from the react-server sibling for the same conceptual error**, and no `@example`. An agent generalizing an error-message pattern learned from one variant will not recognize the other's message as the same failure mode. Also no cross-`@link` between the two implementations in either direction beyond a one-line subpath-resolution note. |
| `./ThemeSwitcher` | `src/theme_switcher/components/theme_switcher.tsx` | 4 | n/a | 3 | 4 | 4 | Good param JSDoc. No `@example`; README has one. Component internally named `ThemeSwticher`/`ThemeSwticherButton` (typo'd internal identifier, not part of the public API surface since export is renamed, but appears in stack traces / dist source maps). |
| `./firebaseAuthClient` | `src/firebase_auth/client/firebase_client.ts` | 4 | 5 | 2 | 4 | 4 | `requireFirebaseAuthConfig` gives an excellent actionable error (see below). No `@example` on `getFirebaseAuthClient` itself despite being the entry point most other firebase_auth files funnel through. |
| `./firebaseAuthClientProvider` | `src/firebase_auth/client/auth_user_provider.tsx` | 3 | 5 | 1 | 3 | 4 | Complex state machine (`consecutiveNulls`, `confirmedSignedOut`, `syncedSignedIn` refs) with zero doc comment on the exported `AuthUserProvider` component itself or its props — an agent has to read ~150 lines of hook internals to learn what wrapping this actually does/requires. `AuthUserContextType`'s shape (`user`, `loading`, `reloadUser`, `sendVerificationEmail`, `logout`) is undocumented per-field. |
| `./firebaseAuthServerProvider` | `src/firebase_auth/server/auth_user_server_provider.tsx` | 4 | 5 | 3 | 3 | 4 | Good JSDoc on both exports, explains the "NOT used by the default auto-wiring path" nuance clearly — a good rubric-1 example of an invariant explained in prose (could be enforced better structurally, see below). |
| `./useFirebaseAuthUser` (react-server) | `src/firebase_auth/server/use_auth_user_server.ts` | 5 | n/a | 2 | 5 | 4 | Excellent doc explicitly calling out the client/server shape-parity contract (`{ user, loading }`) — a rubric-4 exemplar. |
| `./useFirebaseAuthUser` (default) | `src/firebase_auth/client/use_auth_user.ts` | 2 | n/a | 1 | 5 | 4 | One-line JSDoc only; no mention of required `AuthUserProvider` ancestor, no thrown error if used outside it (context has a default value with `loading: true` forever — silent hang, not a thrown error) — contrast with `useLocale`'s explicit throw pattern elsewhere in the same package. |
| `./firebaseAuthActions` | `src/firebase_auth/client/auth_actions.ts` | 2 | 5 | 0 | 3 | 4 | **Zero JSDoc** on any of the three exported factories (`createLoginAction`, `createSignUpAction`, `createForgotPasswordAction`) despite each having a non-obvious signature (`(locale, messages) => (prevState, formData) => Promise<AuthFormState>`, i.e. built specifically for React's `useActionState`/form actions — nothing in the type signature says that). `messages` param is accepted but only `mismatch` is ever read (by `createSignUpAction`); `success` is declared on `AuthActionMessages` but never consumed by any action — dead/misleading field. |
| `./firebaseAuthMiddleware` | `src/firebase_auth/middleware/update_session.ts` | 4 | n/a | 0 | 4 | 3 | Exceptionally well-commented *implementation* (clock skew, cache safety invariants) but the exported `updateSession` function itself has no `@example`, and the doc says "not intended to be called directly unless... opted out" without saying *how* to opt out or call it directly — an agent wanting the manual path has to cross-reference `middlewareEnabled` in `types.ts`. |

**Also reviewed (not directly exported, but load-bearing for every scored file above):**

| File | Sig | Err | Ex | Name | Disc | Notes |
|---|---|---|---|---|---|---|
| `types/types.ts` | 3 | n/a | 3 | 3 | 3 | `ReturnType = any` (explicitly flagged by design spec) is the loosest type in the whole surface — `TranslatorReturnType = (key: string) => any` gives an agent zero signal about what a translation function actually returns (always `string` in practice). `MiddlewareCustomHandler`'s "at most one of rewriteUrl/redirectUrl" invariant is prose-only, not a discriminated union — representable-but-wrong states exist in the type (both set, or the handler could construct its own inconsistent state) even though runtime behavior is safe today. `LocalePrefixMode` is exported and documented as "no runtime effect yet" — a type an agent could set expecting behavior it doesn't get. |
| `config/intl_config.ts` | 2 | **1** | 0 | 4 | 2 | Throws the *weakest error message in the package*: `'Please set config file and set path to it in next.config as in the example'` — no mention of the `@intl-config` alias name, no property/field named, no link/pointer to the README's Setup section or which "example" it means. Directly contradicts the design spec's called-out concern. This is a bare top-level `throw Error()` at **module load time** (not inside a function), meaning any file that transitively imports it (nearly everything) throws immediately if unset, before any of the agent's own code runs — worst discoverability-of-cause combination in the surface. |
| `firebase_auth/require_config.ts` | 5 | **5** | n/a | 5 | 4 | Best error message in the codebase: names the exact missing field (`firebaseAuth`), names the exact fix (add it to `setIntlConfig`'s config), and the mechanism (`asserts fa is FirebaseAuthRoutingConfig`) makes every downstream call site's type narrow correctly post-guard — a genuine rubric-1 *and* rubric-2 exemplar the rest of the package (esp. `intl_config.ts`) should be brought up to match. |

## Structure review

**Predictability of file location from subpath name.** Mostly strong. Every
subpath name maps to an obviously-corresponding path once the
`client/`·`server/`·`config/`·`general/` split is known (`./LocaleLink` →
`client/components/locale_link.tsx`, `./firebaseAuthMiddleware` →
`firebase_auth/middleware/update_session.ts`). Two soft spots:

- `./getLayoutStates` → `general/get_layout_states.ts` is guessable by name,
  but the *content* betrays the name (dead code) — this is a content problem
  disguised as a structure problem; see "new artifact" recommendations below.
- `./metadata` and `./localeStaticParams` both live under different parents
  (`general/` vs `server/functions/`) despite both being "small server-side
  helper" in character — an agent that's read one might reasonably guess the
  other lives beside it and grep the wrong folder first. Not severe (both are
  one hop away via `exports`), but worth flagging as a soft naming-parallel
  gap.

**One-concept-per-file.** Holds throughout the scored surface — every
`exports` entry resolves to exactly one file exporting exactly one
conceptual unit (a few files export 2–3 tightly-related items, e.g.
`server/functions/server.ts` exporting `getMessage`/`getTranslations`/
`getLocale` together, but `package.json` only points at `./server`'s barrel
for those three, and they're genuinely one concept — "server-side translation
resolution" — not unrelated exports bundled together). No violations found.

**Barrel files vs. real subpaths.** Confirmed per `structure.md`: barrels
(`src/*/index.ts`) exist for every top-level folder, are excluded from
coverage, and `exports` mostly points at individual files directly rather
than barrels — except `./client` and `./server`, which *do* point at their
folder's barrel. This split (some subpaths → barrel, most → individual
file) is itself a subtle inconsistency an agent has to notice: grepping
`index.ts` habitually will find the barrel for `client`/`server` (useful)
but nothing at all for e.g. `./LocaleLink` (dead end, must know to check
`package.json` `exports` instead). The two commented-out re-export lines in
`client/index.ts` and `server/index.ts` (the disabled `useLocale`/
`useTranslations` direct exports) compound this: an agent reading the
barrel sees what looks like an oversight, not a deliberate "use `./use`
instead" decision — no comment marks it as intentional.

**`firebase_auth` module depth/naming as analogy test.** This mirrors the
top-level `client/`·`server/`·`config-equivalent (require_config.ts at
root)` split well enough that the analogy holds: an agent who has understood
the top-level package's server/client split can correctly predict that
`firebase_auth/client/*` is `"use client"` and `firebase_auth/server/*` is
RSC-only without being told. `error_messages/` has no top-level-package
analogue (the main package has no equivalent localized-error-message
module), which is fine — it's genuinely new surface — but it also has no
subpath in `exports` at all (not part of the scored surface, confirmed via
`package.json` — `default_messages.en.ts` and `firebase_auth_error_helper.ts`
are internal-only, consumed via `firebaseAuthErrorMessage` inside
`auth_actions.ts`). Worth a documentation note (not a code change) that
`error_messages/` is intentionally unexported, since the "route new
user-facing strings through the package's own i18n mechanism" convention
in `package-authoring.md` might lead a future contributor to expect it to be
public.

**Config-resolution indirection (`@intl-config`/`@locale-file`).** Confirmed
as the single biggest "you must already know this" gotcha, per the design
spec's own framing — validated by direct observation: `config/intl_config.ts`
does a **bare top-level `throw`** on module evaluation if the alias resolves
to nothing, with the weakest error message in the surface (see table above).
There is no `src/config/README.md` or any co-located doc — the only place
this requirement is documented is the package root `README.md`'s Setup
section, which an agent has no automatic reason to open before writing code
that imports from `cloudflare-next-intl/middleware` or any other subpath
that transitively pulls in `config/intl_config.ts`. A file dropped directly
into `src/config/` (next to `intl_config.ts`, `middleware.ts`,
`init_config.ts`) would be seen by an agent who opens that folder to
understand the config surface, independent of whether it also finds the
README.

## Prioritized proposed changes

Ordered by (severity of agent-facing confusion) × (how self-contained the
fix is). Each item tagged by mechanism. **None implemented — approval
required before any of these are executed.**

1. **[error-message]** Rewrite `config/intl_config.ts`'s thrown error to name
   the `@intl-config` alias explicitly and point at the README's Setup
   section, matching the quality bar `firebase_auth/require_config.ts`
   already sets in the same codebase (e.g. name the exact missing alias,
   the exact file to create, and the exact `next.config` field). Highest
   priority: this is the first error most new consumers (human or agent)
   will ever see, and it currently fails the rubric's own worked example.

2. **[new-artifact]** Add `src/config/README.md` (or a doc comment block at
   the top of `intl_config.ts` itself, satisfying the same discoverability
   goal with zero new file) explaining the `@intl-config`/`@locale-file`
   alias requirement, co-located so an agent opening `src/config/` sees it
   before writing an import.

3. **[structural]** Either delete the `./getLayoutStates` `exports` entry and
   its dead source file, or restore a minimal working implementation —
   currently it's a live, publicly-typed export that silently resolves to
   nothing at runtime, which is worse for an agent than either extreme
   (deleting removes the confusing dead end; a real implementation removes
   the trap). This phase does not recommend which; flagging both options for
   a human decision, per the design spec's non-goals.

4. **[type-level]** Replace `ReturnType = any` / `TranslatorReturnType` in
   `types.ts` with `ReturnType = string` (or a template-literal/branded type
   if richer ICU-formatted values are ever returned) — removes the loosest
   type in the public surface with no behavior change, since translation
   functions always return strings today.

5. **[doc-JSDoc]** Add JSDoc + `@example` to the three
   `firebaseAuthActions` factories (`createLoginAction`/`createSignUpAction`/
   `createForgotPasswordAction`) — currently zero doc comments on functions
   whose signature shape (`(locale, messages) => (prevState, formData) =>
   Promise<AuthFormState>`) is non-obvious from the types alone (built for
   `useActionState`, but nothing says so).

6. **[doc-JSDoc]** Align the two `useLocale`/`useTranslations` throw messages
   between `use_functions.ts` (react-server) and `client_hooks.ts` (default)
   — currently different wording (`'Please set IntlProvider before using
   useLocale'` vs. `'useLocale must be used within a LocaleContext'`) for the
   same conceptual failure, breaking the naming-consistency rubric's
   generalize-from-one-learn-the-other premise. Pick one wording and use it
   in both.

7. **[doc-JSDoc]** Add a doc comment to `AuthUserProvider`
   (`firebase_auth/client/auth_user_provider.tsx`) and its
   `AuthUserContextType` fields — currently the most complex exported
   component in the package with zero top-level explanation of what it does
   or what wrapping it requires/guarantees.

8. **[type-level]** Narrow `setCookieClient`'s `value: unknown` param to
   something like `string | number | boolean` — it's only ever
   template-literal-stringified, so `unknown` invites values (objects,
   `undefined`) that will silently serialize to `"[object Object]"` /
   `"undefined"` with no warning.

9. **[error-message]** Give `usePathname()` (client) and `useAuthUser()`
   (client, firebase_auth) an explicit guard + actionable throw when used
   outside their required provider, instead of relying on a transitively
   thrown error from a different-named hook (`usePathname`) or a silently
   perpetual `loading: true` default context value (`useAuthUser`) that
   never surfaces as an error at all.

10. **[doc-JSDoc]** Add a one-line comment to the commented-out `useLocale`/
    `useTranslations` export lines in `client/index.ts` and `server/index.ts`
    explaining they're intentionally disabled in favor of the `./use`
    subpath's conditional export — currently reads as an oversight to
    anyone (agent or human) grepping the barrel.

11. **[new-artifact]** Add an `llms.txt` at the package root summarizing the
    24 subpaths, one line each (name → one-sentence purpose → required
    peer-config, if any), since `package.json`'s `exports` map alone gives
    paths but no purpose signal, and the README currently omits the entire
    `firebaseAuth*` subpath family (7 of the 24 subpaths are undocumented in
    README.md today — confirmed by direct comparison against the exports
    list). Lower priority than the fixes above since it's additive
    documentation rather than fixing an existing wrong/misleading signal,
    but addresses the single largest raw gap-count (7 undocumented
    subpaths).

12. **[error-message]** Make `middleware.ts`'s top-level `catch` and
    `metadata.ts`'s `iAlternatesLinks` catch re-throw (or attach a
    recognizable error code/name) instead of only `console.error`-and-
    silently-degrading — both currently give an agent debugging "this
    doesn't work" nothing to catch or grep for beyond a log line that may
    not even be visible in the deployment environment (Cloudflare Workers
    logs are not always inspected by default).

## Non-findings (explicitly no action recommended)

- `setIntlConfig`, `LocaleLink`, `Link`, `getLocaleStaticParams`,
  `require_config.ts`, and `use_auth_user_server.ts` already meet or exceed
  the rubric across all five dimensions — no changes proposed for these.
- The `firebase_auth` module's overall depth/naming (client/server/middleware
  split) already passes the structure review's analogy test — no reorg
  proposed.
- One-concept-per-file convention holds throughout — no violations found,
  no action needed.

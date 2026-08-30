# npm Package Authoring — Exports, Tree-Shaking, Optional Modules

Companion file: [nextjs.md](nextjs.md) (Next.js-specific conventions used
inside this package).

## `package.json` exports

- `"sideEffects": false` at the package root — required for bundlers to
  tree-shake unused exports; verify no top-level file does side-effecting
  work (e.g. auto-registering something) purely from being imported.
- Prefer **many flat subpaths** over one deep nested export — e.g.
  `"./LocaleLink"`, `"./usePathname"` rather than `"./client/LocaleLink"`.
  One subpath per consumable unit keeps each import minimal and makes the
  public surface self-documenting from `package.json` alone.
- Every subpath entry needs both `types` and `import` (or `require` for
  CJS-compatible packages) pointing at built `dist/` output — never at `src/`.
- Conditional exports (`react-server` vs `default`) for APIs that must
  differ between Server and Client Components (e.g. a `use()`-based hook
  server-side vs. a `useContext`-based hook client-side) — same public
  import path, different implementation resolved by the bundler/runtime.

## Optional submodules (peer deps you don't want to force)

- A submodule requiring a heavy optional dependency (Firebase, Stripe, etc.)
  must be **fully isolated**: nothing in the package's main barrel
  (`index.ts`) or other top-level subpath imports from it. A consumer who
  never imports the optional subpath must never pull the heavy dependency
  into their bundle, even with `sideEffects: false` alone — actually verify
  by building and checking `dist/` output, don't just assume the flag is enough.
- Declare the heavy dependency as a `peerDependency` with
  `peerDependenciesMeta.<name>.optional = true` — never a regular
  `dependency` for something most consumers won't use.
- The optional module gets its own subfolder (`src/<module>/**`) with a
  strict one-way import boundary: it may import the package's own already
  *public* exports (its own subpaths), but should duplicate small internal
  helpers (a module-scope cache, a cookie-name constant) rather than reach
  into the main package's non-exported internals — keeps the module
  deletable as a unit and avoids coupling two independently-versioned
  concerns.
- Enable the whole module with **one boolean field** in the package's
  existing config object (not a second config file, not a separate init
  call) — e.g. `{ enabled: true, ...requiredFields }` as an object (not a
  bare `true`) so future additive fields don't require a breaking signature
  change later.
- Every exported function in an optional module must behave as a documented
  no-op when its config flag is off — check `config.<module>?.enabled`
  at the top of each function, don't assume the consumer only imports it
  when enabled.

## Localization inside a package

- If a package already ships its own translation mechanism, route any new
  user-facing strings (error messages, etc.) through that same mechanism
  under a dedicated namespace, rather than inventing a second config
  surface — a consumer who already has i18n set up gets the new strings
  translated for free by adding one namespace to their existing locale files.
- Always ship bundled-language (usually English) defaults as a literal
  fallback object, keyed identically to the translation namespace, so a
  consumer who does nothing still gets working, correct messages.

## Testing packages with optional native/SDK dependencies

- Mock the SDK at the module boundary (`vi.mock('firebase/app', ...)`,
  etc.) — never instantiate a real client, real project, or make real
  network calls in unit tests.
- Test both the enabled and disabled config path for every exported
  function in an optional module — the disabled/no-op path is the default
  most consumers hit and is easy to under-test.
- Coverage thresholds: enforce 100% per-file via a glob
  (`thresholds.perFile` in Vitest), with named, commented exceptions only
  for branches proven unreachable by manual control-flow trace — never add
  `v8 ignore` pragmas to production source to force a number up without
  that proof; a wrong claim can mask a real untested bug.

## Package size restrictions

- Never move a package out of `dependencies` (e.g. to `peerDependencies`,
  `devDependencies`, or `optionalDependencies`) as a size-optimization move —
  dependency placement is fixed; optimize elsewhere (tarball contents, dead
  code, duplicate build output).
- Never remove `README.md` or `llms.txt` from the `files` field or the
  published tarball to reduce package size — both must always ship.
- **Do** cut install weight by swapping an umbrella package for the scoped
  entry points actually used (`firebase` → `@firebase/{app,auth,app-check,performance}`,
  which cut this package's install size from 398MB to 243MB) — this keeps the
  dependency in `dependencies`, so it is not a placement move.
- Deleting a dependency as "dead code" is also allowed in principle, but
  verify with more than a shallow grep first: check for dynamic
  `import(...)` calls (often inside a guarded/lazy function), not just
  static `import`/`require` statements. `@supabase/supabase-js` in this
  package looked unused to a naive search but is loaded via exactly such a
  guarded dynamic import at `src/db/rest_client.ts:56` — it is a real,
  correctly-isolated dependency and must not be removed.
- `npm run check:size` enforces the swaps that do land — it fails the build
  if a banned heavy package reappears in `dependencies` or if
  `README.md`/`llms.txt` leave the `files` field. Add to `BANNED` in
  `package/scripts/check_size.mjs` whenever a swap like the above lands.

## Documentation

- Every subpath/module gets a short "how to enable / isolation rules /
  gotchas" doc entry, indexed from one central doc-index file consumers
  and future maintainers read first — keep each topic file scoped to one
  area of the package, not one giant reference file.

# Spec: Reduce `cloudflare-next-intl` install footprint

## Problem

The published tarball is already small — `npm pack --dry-run` reports
**127 KB packed / 470 KB unpacked / 277 files**. Tarball contents are not
the bottleneck.

The bottleneck is the transitive `node_modules` weight forced on every
consumer by the package's 9 production dependencies. Measured on
macOS/arm64 with `npm i --omit=dev --ignore-scripts` of exactly the
`dependencies` block of `package/package.json@0.8.61`:

| Item | Size |
|---|---|
| **Total** | **398 MB** |
| `@embedded-postgres/darwin-arm64` | 144 MB |
| `@firebase/*` | 111 MB |
| `firebase` (umbrella) | 45 MB |
| `drizzle-orm` | 16 MB |
| `@img/*` (sharp binaries) | 16 MB |
| `drizzle-kit` | 9.8 MB |
| `@esbuild/darwin-arm64` | 9.5 MB |
| `@esbuild-kit/core-utils` | 9.3 MB |
| `@supabase/*` | 8.6 MB |
| `@grpc/*` | 3.8 MB |
| `@types/node` (runtime dep of `@grpc/grpc-js`) | 2.6 MB |

## Constraints (from `.agent/.sub-rules/packages/package-authoring.md`)

These are **hard rules**. The obvious fixes are banned and MUST NOT be
attempted:

1. **Never move a package out of `dependencies`** — not to
   `peerDependencies`, not to `devDependencies`, not to
   `optionalDependencies` — as a size-optimization move. Dependency
   *placement* is fixed.
2. **Never remove `README.md` or `llms.txt`** from the `files` field or
   the published tarball. Both must always ship.
3. Optimize elsewhere only: **tarball contents, dead code, duplicate build
   output** — and, by extension, swapping a declared dependency for a
   lighter package that does the same job while staying in `dependencies`.

## Approved levers

### A. Remove a dependency that is never imported (dead code)

`@supabase/supabase-js` (8.6 MB) is declared in `dependencies` but is
**never imported anywhere** in `src/`, `bin/`, or `scripts/`.
`src/db/rest_client.ts:14` states this explicitly: the PostgREST client
shape is declared *structurally* so "nothing here imports
`@supabase/supabase-js`". Deleting an unused dependency is dead-code
removal, not a placement move — allowed by constraint 3.

**Saving: 8.6 MB.**

### B. Swap the `firebase` umbrella for the scoped entry points it uses

The package imports exactly four Firebase entry points — `firebase/app`,
`firebase/auth`, `firebase/app-check`, `firebase/performance` — and every
one of those imports is either `import type` (13 sites) or a dynamic
`import()` (6 sites). No value is imported statically.

The umbrella `firebase` package drags in `@firebase/firestore` (63 MB),
`@firebase/database` (8.6 MB), `@firebase/ai`, `@firebase/storage`,
`@firebase/data-connect`, `@firebase/messaging`, all the `-compat`
shims, plus `@grpc/*` (3.8 MB) and `@types/node` (2.6 MB) transitively.
None of it is reachable.

Declaring `@firebase/app`, `@firebase/auth`, `@firebase/app-check` and
`@firebase/performance` directly — still in `dependencies` — is a
lighter-equivalent swap, not a placement move.

Verified empirically: the scoped install is **23 MB** vs **156 MB**, and
`@firebase/auth` exports `getAuth`, `signInWithEmailAndPassword`,
`onAuthStateChanged`, `onIdTokenChanged`, `GoogleAuthProvider`,
`signInWithPopup`, `browserLocalPersistence`, `connectAuthEmulator` —
identical to `firebase/auth`, because `firebase/auth` is a thin re-export
of `@firebase/auth`.

**Saving: ~133 MB.**

### C. Swap `embedded-postgres` for PGlite

`embedded-postgres` pulls a real, per-platform PostgreSQL server build:
`@embedded-postgres/darwin-arm64` alone is **144 MB** — the single largest
line item, 36% of the total. It is used in exactly one place,
`bin/ephemeral_pg.mjs:31`, behind an already-dynamic `await
import('embedded-postgres')` with a graceful fallback path, to spin up a
throwaway Postgres that `drizzle-kit pull` and `pg` introspect over the
wire protocol.

`@electric-sql/pglite` + `@electric-sql/pglite-socket` provide a
WASM Postgres with a real TCP wire-protocol listener — the same contract
`bin/db_codegen.mjs` needs — for **26 MB** total.

This is a lighter-equivalent dependency swap. It stays in `dependencies`.

**Saving: ~118 MB — but only if verified working.** PGlite is
single-connection; `PGLiteSocketServer` serves one client at a time. If
`drizzle-kit pull` opens concurrent connections this swap fails, and the
task must be abandoned rather than forced.

## Non-goals

- Moving `drizzle-kit`, `drizzle-orm`, `embedded-postgres`, `pg`, `sharp`,
  `jose` or `@microsoft/clarity` to peer/dev/optional dependencies.
  Banned by constraint 1.
- Trimming `README.md` (55 KB) or `llms.txt` (19 KB) from the tarball.
  Banned by constraint 2.
- Any change to the public export surface. Every subpath in
  `package.json#exports` must keep resolving.

## Target

| Stage | node_modules |
|---|---|
| Today | 398 MB |
| After A + B | 243 MB (measured) |
| After A + B + C | ~125 MB (projected) |

## Acceptance criteria

- `npm test` passes with 100% per-file coverage thresholds intact.
- `npm run build && npm run check:exports` passes — all export targets
  still importable.
- `README.md` and `llms.txt` still present in `npm pack --dry-run` output.
- No entry in `dependencies` has been relocated to `peerDependencies`,
  `devDependencies`, or `optionalDependencies`.
- The `example/` app builds against the local package.

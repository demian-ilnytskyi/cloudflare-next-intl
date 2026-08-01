# Backend — entry

Server / database / shared-language rules. Larger topics have their own files
under [`backend/`](backend/); the small ones (TypeScript, Python) live here.

## Per-service files

- [backend/postgres.md](backend/postgres.md) — Postgres / Supabase (schema,
  RPC, perf).
- [backend/firebase-functions.md](backend/firebase-functions.md) — Firebase
  Cloud Functions v2.
- [backend/supabase-edge.md](backend/supabase-edge.md) — Supabase Edge
  Functions (Deno + TS).

## TypeScript (both Firebase + Edge)

- `"strict": true`, `noUncheckedIndexedAccess: true`. No `any`.
- **zod-first**: define schema, derive type with `z.infer`. Validate at every
  boundary (HTTP body, callable input, external API response).
- **Discriminated unions** over throwing for expected failure modes.
- Prefer `readonly` where the value doesn't need to change.
- **Parallelize independent promises.** Never `await` independent calls
  sequentially. Use `Promise.all([...])` when all must succeed (fail-fast) or
  `Promise.allSettled([...])` when you want every result regardless of
  individual failures. Only chain `await`s when one call genuinely depends
  on the previous result.

## Python helper scripts (in `scripts/`)

- Stdlib first, single file per script, `argparse` CLI, `--dry-run` for
  destructive ops.
- Type-hinted, `ruff`-formatted, idempotent.
- Never log secrets; never write outside the project root without explicit
  confirmation.

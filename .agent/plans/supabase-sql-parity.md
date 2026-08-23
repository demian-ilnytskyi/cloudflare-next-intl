# Supabase-mode SQL parity with connection-string mode

## Verdict

No. Supabase mode (`drizzle-orm/pg-proxy` → `cfni_exec`) accepts a strict
subset of what connection-string mode accepts. The Drizzle *query builder* API
is identical, but the SQL it emits fails or silently misbehaves in several
common cases.

## Confirmed gaps

1. **Parameters are broken for any statement with `$n`.**
   `package/supabase/cfni_exec.sql` does `execute format(...) using args`,
   where `args` is one `text[]`. `EXECUTE ... USING x` binds `$1 := x`, so:
   - `$1` receives the whole array, `$2`+ are unbound
     (`there is no parameter $2`);
   - even with one param, `where id = $1` becomes `int = text[]`.
   Every parameterised query — i.e. almost every Drizzle query — fails.
   Existing tests mock `.rpc()`, so nothing catches this.

2. **Even if binding is fixed, `using` forces `text`.**
   The `pg` driver sends untyped parameters and lets Postgres infer;
   `using args[i]` (text) yields `operator does not exist: integer = text`,
   `uuid = text`, `jsonb = text`, etc.

3. **No DML.** The statement is wrapped as `from (%s) r`. Postgres forbids
   `INSERT`/`UPDATE`/`DELETE` in `FROM`, with or without `RETURNING`. All
   writes fail — including everything `onConflictSet`/`excluded` exist for.

4. **No transactions, no session state.** `pg-proxy` cannot open one, so
   `db.transaction()` runs non-atomically instead of erroring, and
   `set local` / `set_config` / `begin` statements fail.

5. **Result-value fidelity.** `json_agg(json_build_array(r.*))` returns
   JSON-typed values, not pg wire text. Drizzle's column mappers expect the
   text form: `int[]` arrives as `[1,2]` instead of `{1,2}`, `bytea` as a
   JSON string, `boolean` as `true` not `t`, timestamps in ISO `T` form.

6. **`rowCount` is lost.** `method: 'execute'` returns only `rows`, so
   affected-row counts are always absent.

7. **Firebase ID tokens.** `resolveAccessToken` falls back to a Firebase ID
   token (RS256, Google-signed). PostgREST rejects it with 401 unless the
   project has Supabase third-party (Firebase) auth configured — where
   connection-string mode works via `set_config('request.jwt.claims')`.

## Plan

Order matters: 1 → 2 → 3 gate everything else.

### 1. Integration test harness (do first, no fix without it)
- `package/src/db/supabase_parity.int.test.ts`, run against a real Postgres
  (`supabase start` or a docker Postgres) with `cfni_exec.sql` installed, and
  driven through the real `createSupabaseTransport` with `.rpc()` replaced by a
  thin direct `pg` call to `cfni_exec` (keeps the test off the network while
  exercising the actual SQL).
- Table-driven: run the *same* Drizzle query in both modes and assert equal
  results. Cases: multi-param `where`, `int`/`uuid`/`jsonb`/`timestamp`/
  `numeric`/`text[]` params and columns, `inArray`, `insert … returning`,
  `insert` without returning, `onConflictDoUpdate` with `excluded`, `update`,
  `delete`, CTE (`with`), `windowCount`, joins with duplicate column names,
  `null` params.
- Gate the file behind an env flag so unit CI stays offline.

### 2. Fix parameter binding — substitute literals client-side
Keep `cfni_exec` param-free; do the substitution in
`package/src/db/supabase_transport.ts` where the values are still typed.
- New `package/src/db/inline_params.ts`: `inlineParams(sql, params)` scans the
  statement and replaces `$n` outside string literals, `E''` strings,
  dollar-quoted bodies, `"identifiers"`, `--` and `/* */` comments.
- New `package/src/db/encode_param.ts`: serialises a JS value to a Postgres
  literal the way `pg` does — `null` → `NULL`, string → `'…'` with `''`
  doubling, number/bigint/boolean verbatim, `Date` → ISO in UTC, `Uint8Array`
  → `'\x…'`, array → `'{…}'` with element quoting, plain object → JSON string.
  Quoted literals are `unknown`-typed, so Postgres infers the same types the
  driver path gets — this fixes gaps 1 and 2 together.
- Unit-test both files exhaustively (escaping, nesting, `$10` vs `$1`,
  `$$body with $1$$`, `'literal $1'`).
- `params` stays in the RPC payload only for the batch path (below); the
  statement sent is fully inlined.

### 3. Rewrite `cfni_exec` for DML and value fidelity
`package/supabase/cfni_exec.sql`, still `security invoker`, still no role arg:
- Classify the statement: leading keyword after stripping comments/`WITH`
  chains. `SELECT`/`VALUES`/`TABLE`/`WITH … SELECT` → wrap in `FROM (…) r`.
  `INSERT`/`UPDATE`/`DELETE` **with** `RETURNING` → wrap as
  `with r as (<stmt>) select … from r`. DML **without** `RETURNING` →
  `execute` directly, return `'[]'` and report `row_count`.
- Emit pg-text values instead of JSON scalars: aggregate
  `array_agg(value order by ord)` over
  `json_each_text(to_json(r.*)) with ordinality`, which preserves column
  order, duplicate names, `null`, and full `numeric` precision.
- Return `json_build_object('rows', …, 'rowCount', …)` and have the transport
  read `rows` from it (accepting a bare array for older installs).
- Ship the file version-stamped (`-- cfni_exec v2`) and add a
  `select cfni_exec_version()` check surfaced in the "install this function"
  error path, so an outdated install is named as such.

### 4. Make unsupported things fail loudly
- `package/src/db/context.ts`: in Supabase mode, wrap the handle so
  `.transaction()` throws
  `db: transactions are not available in Supabase mode …` instead of running
  non-atomically.
- Add `cfni_exec_batch(statements json)` and route `withUserDb` bodies that
  need atomicity through it only if we later expose an explicit batch API —
  out of scope here, noted as the follow-up for real transactions.

### 5. Array/bytea column mapping
- Once values arrive as pg text (step 3), the remaining mismatch is array
  literals; confirm with the step-1 matrix and, if `to_json` still differs,
  cast composite output through `r::text` parsing only for array columns, or
  document `text[]`/`bytea` as unsupported in Supabase mode.

### 6. Auth parity
- `package/src/db/access_token.ts`: on a 401/`PGRST301` from the transport,
  raise a message naming Supabase third-party (Firebase) auth setup as the
  fix.
- Document in `.agent/.sub-rules/packages/` (new `db.md`) which of the two
  modes supports what, and the `cfni_exec` install/upgrade step.

### 7. Verification
- `rtk npm --prefix package test` (unit) green.
- Integration matrix green against real Postgres in both modes.
- `rtk npm --prefix package run build` / typecheck green.

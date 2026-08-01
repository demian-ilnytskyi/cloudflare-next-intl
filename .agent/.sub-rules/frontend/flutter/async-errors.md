# Flutter — Async calls & Error handling

## Async calls — parallelize when independent

- **Never `await` independent futures one by one.** If a repository needs
  results from N calls that don't depend on each other, run them in parallel:

  ```dart
  final results = await Future.wait([
    repoA.fetch(),
    repoB.fetch(),
  ]);
  ```

  Use `Future.wait` for fail-fast and `Future.wait(..., eagerError: false)` /
  per-future `try`-via-helper when partial failures are acceptable.
- Only chain `await`s when call N genuinely needs the result of call N-1.
- For Supabase data: if a single screen needs several reads, prefer **one
  combined RPC** over N parallel `supabase.rpc(...)` calls — see
  [`../../backend/postgres/perf.md`](../../backend/postgres/perf.md).

## Error handling (mandatory)

- **No try/catch in repositories, blocs, or widgets.** Use the project helpers:
  - `eitherFutureHelper` / `eitherHelper` — fallible operations returning
    `Either<Failure, T>`.
  - `valueFutureHelper` / `valueHelper` — when a non-Either return is needed.
- The repo layer maps SDK errors to domain failures inside the helper.
- The bloc consumes the `Either` and updates `status` accordingly.

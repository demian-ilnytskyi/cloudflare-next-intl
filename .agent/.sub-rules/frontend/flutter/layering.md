# Flutter — Layering, DI

See [async-errors.md](async-errors.md) for error handling and
parallel call patterns.

## Layering & responsibilities (mandatory)

Strict layering — keep concerns where they belong:

- **Service / data provider** (`*Service`): thin wrapper around a native lib or
  external call (e.g. `SupabaseService`, `FirestoreService`). Just performs the
  call and returns the raw result. No error handling, no business logic, no
  caching, no transformations beyond what the SDK already returns.
- **Repository**: the **only** place that handles errors and orchestrates side
  effects. Calls one or more services, wraps everything in `eitherFutureHelper`
  / `eitherHelper` (or `valueFutureHelper` / `valueHelper`), maps SDK results
  into domain models, and may do extra steps such as caching, retries, or
  combining multiple sources. No UI logic.
- **Bloc / Cubit**: holds state and reacts to events. Calls repositories,
  stores the returned data, and performs **local state transitions only** (e.g.
  set a selected item, mark loading, append a page). No direct service calls,
  no error handling beyond consuming the `Either` from the repo.
- **UI / widgets**: as **dumb** as possible. Read state via `BlocBuilder` /
  `BlocSelector`, dispatch events. **No business logic in widgets.**

> Example: `SupabaseService.fetchNotes()` returns the raw response → the repo
> wraps the call in `eitherFutureHelper`, maps it to `List<Note>`, optionally
> caches it → the bloc stores the list and selects the first item.

## State management & DI

- **Prefer Bloc/Cubit over `StatefulWidget`.** Use `StatefulWidget` only when
  the state is purely UI-local (animation controllers, focus nodes, scroll
  controllers). For anything domain-related — a tiny `Cubit`.
- **All Blocs / Cubits / repositories / services are registered with
  `injectable` and resolved via `GetIt`.** Never construct them inline. Use the
  generated `getIt<MyBloc>()` (or a `BlocProvider(create: (_) => getIt())`).
- Run `dart run build_runner build --delete-conflicting-outputs` after editing
  `@injectable` / `@singleton` / `@lazySingleton` annotations.

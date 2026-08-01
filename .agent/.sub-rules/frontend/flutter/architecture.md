# Flutter — Core conventions

Sibling files: [layering.md](layering.md) (services / repos /
blocs), [no-utils.md](no-utils.md) (no helper files),
[async-errors.md](async-errors.md) (Future.wait, error
helpers), [bloc.md](bloc.md) (Bloc/Cubit patterns).

## Dependency Injection

- **All Blocs and Cubits must be annotated with `@injectable`** (or `@lazySingleton` / `@singleton` where appropriate).
- **Never instantiate Blocs/Cubits directly.** Always resolve via `GetIt`: `getIt<FeatureCubit>()`.
- Register DI in `injection.dart` via `@InjectableInit`. Run `dart run build_runner build` after changes.

## Conventions

- Repository pattern: presentation → domain (interfaces) → data
  (implementations).
- `const` constructors everywhere possible. Reduce rebuilds via `context.select`
  and `buildWhen`.
- **Enums over const strings.** Any fixed-value string (status, type, kind,
  category) must be an `enum`, not a `String` constant or string literal.
- **File length budget**: keep each Dart file ≤ **250 lines**. If it grows past
  that, split.
- **One widget per file.** Prefer extracting each widget into its own file —
  don't pile multiple widget classes into the same file even when they're
  small. Place them under the page's `widget/` subfolder (`body/`, `widgets/`,
  `bloc_provider/`, `bloc_listener/` — see `page.md`).
- **Postgres access from Flutter is RPC-only.** Call Supabase RPC functions
  (`supabase.rpc(...)`) which run with the user's JWT under RLS. Never read or
  write tables directly from Flutter (`supabase.from('...').select/insert/...`
  is forbidden). All filtering, search, sort, and pagination are RPC params,
  not client-side `from()` queries.
- Run `flutter analyze` and `flutter test` before declaring done.

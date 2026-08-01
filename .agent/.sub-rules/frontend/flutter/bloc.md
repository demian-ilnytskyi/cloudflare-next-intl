# Flutter — Bloc / Cubit

See [architecture.md](architecture.md) for layering, DI, and
error handling.

## Dependency Injection

- **Annotate every Bloc/Cubit with `@injectable`** (use `@lazySingleton` only for true singletons).
- **Resolve via GetIt in `BlocProvider`**: `BlocProvider(create: (_) => getIt<FeatureCubit>())`. Never `FeatureCubit()` directly.

## Bloc / Cubit class rules

- **NEVER hand-roll state.** State and event classes MUST use `freezed`. No manual `==`, `hashCode`, or `copyWith` — ever.
- **NEVER put state inline in the bloc/cubit file.** State MUST live in its own file (`feature_state.dart`) joined via `part`/`part of`.
- **Single `const factory` constructor in state.** Each Bloc/Cubit state has exactly **one** `const factory` constructor with optional named params and a `status` field. NEVER create multiple state classes or union cases per Bloc/Cubit.
- **Bloc/Cubit boundaries**: never inject a Bloc into a Cubit. Coordinate
  cross-bloc state in UI via `BlocListener`.
- Run `dart run build_runner build --delete-conflicting-outputs` after edits.

## File layout (one class per file, joined by `part` / `part of`)

```
feature_bloc/
├── feature_bloc.dart       // part 'feature_state.dart'; part 'feature_event.dart';
├── feature_state.dart      // part of 'feature_bloc.dart';
└── feature_event.dart      // part of 'feature_bloc.dart';  (omit for Cubit)
```

- Bloc/Cubit, state, and event each live in their own file.
- For a Cubit, drop the event file.

## Bloc usage in widgets

- **Read state only via `BlocBuilder` or `BlocSelector`.** Never use
  `context.watch`, `context.read` (for rebuilds), or `BlocProvider.of` to drive
  rebuilds.
- **One field** from state → `BlocSelector`. **Multiple fields** → `BlocBuilder`
  with `buildWhen`.
- **A Bloc must never call another Bloc.** Cross-bloc coordination happens in
  the UI via `BlocListener` (`listenWhen` to scope what triggers it).
- Build + listen on the same bloc → `BlocConsumer` (with `buildWhen` +
  `listenWhen`).
- Multiple listeners/providers → `MultiBlocListener` / `MultiBlocProvider`.
- **`BlocProvider` lives in its own file** (`widget/cubit_provider/<name>_cubit_provider.dart` or `widget/bloc_provider/<name>_bloc_provider.dart`), not inline in the screen/view. See `form_example_bloc_provider.dart` as the canonical example.
- **`BlocProvider` triggers initial load**: call `..load()` (or equivalent) in the `create:` callback, not in `initState` of a `StatefulWidget`. Prefer `StatelessWidget` for blocks that don't need lifecycle hooks.
- **`context.watch` is banned.** Use `BlocBuilder` or `BlocSelector` exclusively.

---
name: flutter-patterns
description: Flutter architecture, state, buttons, forms, and paginated lists used in clarivant. Bloc with single state class, eitherHelper for errors, RPC-backed data, Skeletonizer loading.
---

# Flutter Patterns

## State management

- **Bloc** for flows with discrete events / state machines.
- **Cubit** for simple UI state.
- **Never inject a Bloc into a Cubit.** Coordinate cross-bloc state in UI via
  `BlocListener` / `MultiBlocListener`.
- **Single state class per Bloc**: one factory constructor with optional
  params + a `status` field (`initial / loading / success / failure`). Do not
  create multiple state subclasses.

## Error handling

- **No `try/catch` in Repositories or Blocs.** Use the project helpers:
  - `eitherHelper` (sync)
  - `eitherFutureHelper` (async)
- Repositories return `Either<Failure, T>`. Blocs map the result into the
  `status` field of the state.

## Repository pattern

- `Repository` interfaces in `domain/`, implementations in `data/`.
- Data sources (Supabase RPC, Firebase, local cache) are hidden behind
  repositories.
- Cubits/Blocs depend on repository interfaces, never directly on data sources.

## Buttons

- Use `UserButton` / `AppButton`. **Never** bare `GestureDetector` or `InkWell`
  for tappable UI.
- Padding goes **inside** the button widget so the entire visual area is
  tappable.
- Bind `isLoading` to the Bloc's `status` for submit actions.

## Forms (ref: `lib/components/form_example`)

Feature folder layout:

```
feature/
  bloc/
  view/
  widget/
    body.dart
    bloc_provider.dart
```

- Show field validation errors **only after** the user taps submit.
- Bind `TextFieldWidget.readOnly` and the submit button's `isLoading` to the
  Bloc's `status`.
- Use `TextFieldWidget` exclusively — no custom external styling.
- Show submission status / errors via `SendingTextWidget` near the action
  button.

## Paginated lists (ref: `lib/components/data_load_example`)

- Lazy-load via pagination. Never fetch the whole list.
- **Search/filter on the server** via RPC parameters — not local list
  manipulation.
- Always handle these UI states explicitly:
  - ⏳ loading (use `Skeletonizer` wrapping the real item widget with mock data)
  - 📭 empty
  - ❌ error
  - data
- Guard concurrency: do not trigger "load more" while another fetch is in flight
  (`status == loading`).

## Data access

- Postgres access is **always via RPC** (`supabase.rpc('name', params: {...})`),
  never `from('table').select(...)`.
- User identity is resolved server-side inside the RPC. Do not pass `user_id`
  from the client.

## Widgets

- Stateless by default. Promote to Stateful only for controllers
  (`AnimationController`, `TextEditingController`).
- `const` constructors everywhere possible.
- Reduce rebuilds via `context.select((Bloc b) => b.state.field)` and
  `buildWhen`.
- Split large `build` methods into private widget classes (not methods) so
  `const` is preserved.

## Async safety in Blocs/Cubits

- Cancel stream subscriptions on `close`.
- Guard `emit` after close: `if (isClosed) return;`.
- Prefer `emit.forEach` / `emit.onEach` in Blocs for stream-driven events.

## Testing

- `bloc_test` for state transitions.
- `mocktail` for mocks (no codegen).
- Golden tests behind a tag (e.g. `--tags golden`) so they don't run by default.

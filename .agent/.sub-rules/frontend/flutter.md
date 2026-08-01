# Flutter — rules index

All leaf files live in [`flutter/`](flutter/). Open only the file(s) for the
change you're making.

## Architecture & code organization

- [flutter/architecture.md](flutter/architecture.md) — core conventions
  (RPC-only, enums, file budget, one widget per file).
- [flutter/layering.md](flutter/layering.md) — service / repo / bloc / UI
  responsibilities, `injectable` + `GetIt`.
- [flutter/no-utils.md](flutter/no-utils.md) — no `*_utils.dart` /
  `*_helper.dart`; use widget methods, blocs, or extensions.
- [flutter/async-errors.md](flutter/async-errors.md) — `Future.wait` for
  independent calls; `eitherHelper` / `eitherFutureHelper` for errors.

## State

- [flutter/bloc.md](flutter/bloc.md) — Bloc / Cubit (freezed state, single
  `const factory`, `part` / `part of`, widget usage).
- [flutter/models.md](flutter/models.md) — `freezed` + `json_serializable`
  models, `l10n`, `flutter_screen_util` sizing tokens.

## UI

- [flutter/ui-sizing.md](flutter/ui-sizing.md) — sizing strategy: prefer
  constraints, avoid `MediaQuery.sizeOf` / `LayoutBuilder`, no raw px.
- [flutter/ui-widgets.md](flutter/ui-widgets.md) — colors & theming, buttons,
  widget choices (`DecoratedBox` over `Container`, avoid `Stack`), scrolling,
  `SafeArea`.

## Pages

- [flutter/page.md](flutter/page.md) — `go_router` page folder layout, forms
  (`form_example`), paginated lists (`data_load_example`).

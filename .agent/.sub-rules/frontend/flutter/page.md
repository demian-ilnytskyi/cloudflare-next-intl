# Flutter — Page Structure, Forms, Lists

Sibling files: [ui-sizing.md](ui-sizing.md), [ui-widgets.md](ui-widgets.md) (UI primitives — colors, sizing,
widgets, scrolling, AppBar).

## Page structure (mandatory)

Pages are wired through `go_router`. Per-page folder layout:

```
feature_x/
├── view/
│   ├── feature_x_page.dart          // Scaffold + body + BlocProviders root
│   ├── feature_x_bloc_provider.dart // MultiBlocProvider for the page
│   └── feature_x_body.dart          // The body widget under Scaffold
└── widget/
    ├── bloc_provider/               // All BlocProviders used by this page
    ├── bloc_listener/               // All BlocListeners used by this page
    ├── body/                        // Sub-bodies / sections used by the page body
    └── widgets/                     // All other widgets used by this page
```

## Forms (ref: `lib/components/form_example`)

- **All forms** must follow `form_example`. Do not roll your own form scaffold.
- Folder structure per feature: `bloc/`, `view/`, `widget/` (with `body` and
  `bloc_provider`).
- Show field validation errors **only after** the user taps submit.
- Bind button `isLoading` and field `readOnly` to the Bloc's `status`.
- Inputs: use `TextFieldWidget` exclusively — no custom external styling.
- Submission errors / status: render via `SendingTextWidget` near the action
  button.

## Lists / data loading (ref: `lib/components/data_load_example`)

- **All paginated/loaded screens** must follow `data_load_example`.
- **Infinite loading only.** Never load all items in a single request — always
  fetch a page and load more on scroll.
- **Filter, search, and sort happen on the backend** (Postgres RPC params or
  Firebase query filters). Never filter/sort the full set on the client.
- **Never hard-code a page size / `limit` on the Flutter side.** Page size,
  default sort, and any other paging knobs live as **RPC parameter defaults
  on the backend** (Postgres `p_limit int default 20`, Firebase query
  config). The client passes only what the user actually changes (cursor,
  next page) — it must not ship its own `const _pageSize = 20`.
- Explicit UI states: ⏳ loading, 📭 empty, ❌ error, plus the data state.
- Loading: `SkeletonizerWidget` wrapping the real item widgets with mock data
  so the layout matches.
- Concurrency guard: do not trigger "load more" while a fetch is in flight.

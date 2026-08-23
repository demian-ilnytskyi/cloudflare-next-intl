# Package Structure — `package/src/**`

Companion files: [config-and-routing.md](config-and-routing.md),
[server-client-split.md](server-client-split.md), [db.md](db.md).

## Folder layout

```
package/src/
├── config/       # @intl-config resolution, intlMiddleware, cookie key names, sitemap
├── general/      # translation resolution, cache, metadata, layout states (dead)
├── server/       # RSC-only: server_provider, Link, helper_script, use_functions, locale_static_params
├── client/       # "use client": client_provider, LocaleLink, hooks, cookie helpers
├── theme_switcher/ # self-contained dark-mode toggle module
├── db/           # Postgres/Supabase data access layer: wrappers, transport, AST parser, REST execute
├── types/        # RoutingConfig, TranslationObject, MiddlewareCustomHandler — .d.ts + types.ts
└── test_utils/   # vitest fixtures only, never shipped/covered
```

Each folder ships its own barrel `index.ts` re-exporting its public surface
— barrels are excluded from coverage (no branch logic) and are NOT
necessarily what `package.json`'s `exports` map points at (see
[package-authoring.md](package-authoring.md) — most subpaths point directly
at individual source files, not the barrel).

## Module boundaries — don't cross these without a reason

- `server/**` must never import from `client/**` (breaks RSC bundling) —
  the one sanctioned exception is `server/components/server_provider.tsx`
  using `next/dynamic` to lazily load a client component, which is a
  deliberate, explicit server→client boundary crossing, not a violation.
- `general/**` and `config/**` are the shared core both `server/**` and
  `client/**` depend on — never the other direction.
- `theme_switcher/**` depends only on `client/functions/set_cookie.ts` and
  `config/cookie_key.ts` — keep it that way; it's designed to be
  deletable/replaceable as a unit.

## `src/general/get_layout_states.ts` — dead code, do not touch

Entirely commented out (disabled deliberately per the file's own header
comment). `package.json`'s `./getLayoutStates` subpath still points at it,
but resolves to zero runtime exports. Excluded from coverage's `include` set
for exactly this reason. Don't delete the commented code or re-enable it
without checking with a human first.

## Two parallel `useLocale`/`useTranslations` implementations exist on purpose

`server/functions/use_functions.ts` (RSC, React `use()`-based) and
`client/hooks/client_hooks.ts` (Client Component, context-based) are named
identically and both reached via the single `./use` subpath's conditional
export (`react-server` vs `default`). They have genuinely different data
sources and cannot share an implementation — do not consolidate them.

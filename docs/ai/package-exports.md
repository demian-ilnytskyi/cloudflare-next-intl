# Package Exports — the public API surface

`package/package.json`'s `exports` map is the actual contract consumers
depend on — `package/src/index.ts`'s barrel export is NOT what's published
(most subpaths point at individual files, not the barrel). If you add,
rename, or move a source file that's meant to be publicly importable, you
**must** add/update the matching `exports` entry, or it silently isn't
reachable from a consumer's `import ... from 'cloudflare-next-intl/...'`.

Current subpaths (see `package/package.json` for the authoritative list):

| Subpath | Source file | Notes |
|---|---|---|
| `.` (bare) | `src/index.ts` | Barrel — re-exports config/general/server/client/theme_switcher/types |
| `./client` | `src/client/index.ts` | |
| `./server` | `src/server/index.ts` | |
| `./middleware` | `src/config/middleware.ts` | The `intlMiddleware` default export |
| `./setIntlConfig` | `src/config/init_config.ts` | |
| `./serverProvider` | `src/server/components/server_provider.tsx` | Exported as `IntlProvider` |
| `./Link` | `src/server/components/link.tsx` | Server-safe, locale-aware `next/link` wrapper |
| `./IntlHelperScript` | `src/server/components/helper_script.tsx` | |
| `./LocaleLink` | `src/client/components/locale_link.tsx` | Client-only, explicit-locale link |
| `./usePathname` | `src/client/hooks/use_path_name.ts` | |
| `./metadata` | `src/general/metadata.ts` | |
| `./getLayoutStates` | `src/general/get_layout_states.ts` | **Currently dead** — see [`docs/ai/config-and-general.md`](config-and-general.md) |
| `./setCookieClient` | `src/client/functions/set_cookie.ts` | |
| `./getCookieClient` | `src/client/functions/get_cookie.ts` | |
| `./localeStaticParams` | `src/server/functions/locale_static_params.tsx` | |
| `./use` | conditional: `src/server/functions/use_functions.ts` (react-server) / `src/client/hooks/client_hooks.ts` (default) | See [`docs/ai/server.md`](server.md) |
| `./ThemeSwitcher` | `src/theme_switcher/components/theme_switcher.tsx` | |

## The `./use` subpath's conditional export is the trickiest one

It's the only entry with a `react-server` / `default` condition split. This
relies on the consuming bundler correctly distinguishing "this import site
runs in the RSC environment" from "this runs in a client bundle" — if you
ever add a similar dual-environment API, follow this exact pattern (see
`package.json`'s `./use` entry) rather than inventing a new mechanism.

## Build output

`npm run build` = `tsc` (declared in `package/package.json`'s `scripts`).
Output goes to `package/dist/`, which — unusually — **is committed to git**
(not gitignored), so a stale `dist/` after a source change without
rebuilding is a real risk. If you run `npm run build` for local verification
during test-writing work (not required, since tests run against `src/`
directly via vitest), check `git status` afterward and discard incidental
`dist/` changes that aren't part of your actual task (this happened once
during Phase 1's Task 1 fix — verification builds left stray `dist/` diffs
that had to be discarded before committing).

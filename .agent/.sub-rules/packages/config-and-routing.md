# Config & Routing — `package/src/config/**`, `package/src/general/**`

Sibling files: [structure.md](structure.md), [testing.md](testing.md).

## `@intl-config` / `@locale-file` are load-bearing path aliases

`config/intl_config.ts` does `import intlConfig from '@intl-config'` — a
`tsconfig.json`/bundler path alias the consumer maps to their own config
file (built via `setIntlConfig`). Not a real npm package. If unresolved,
`getConfig()` throws `Error('Please set config file...')` **at module load
time** (top-level `const config = getConfig()`), so importing
`intl_config.ts` at all can throw synchronously — never wrap this in a lazy
getter to "fix" the throw; failing fast at import time is intentional.

`@locale-file` resolves to the consumer's translation JSON, loaded via
dynamic `import(\`@locale-file/${locale}.json\`)` in `server/functions/server.ts`.

In tests both aliases are mapped (via `vitest.config.ts`'s `resolve.alias`)
to fixtures under `src/test_utils/` — see [testing.md](testing.md).

## `intlMiddleware` (`config/middleware.ts`) — does a lot in one pass

1. Resolve locale: valid cookie → bot detection (dynamically imported
   `next/dist/server/web/spec-extension/user-agent`'s `isBot`) →
   `accept-language` header (`get_user_locale.ts`'s `languageDetecotr` —
   typo is intentional/existing, don't "fix" without checking call sites).
2. Rewrite (default locale, unprefixed) vs. redirect (any other locale) vs.
   pass-through, based on whether the URL already carries a locale prefix.
3. Optional `middlewareHandler` callback — the extension point for consumer
   auth/feature-flag logic. At most one of `rewriteUrl`/`redirectUrl` is
   ever set. Does NOT run on the redirect path unless
   `runHandlerOnRedirect: true`.
4. Sets locale cookie (only if changed) + bot-detection cookie +
   `Content-Language` header.
5. try/catch wraps everything — any internal error falls back to bare
   `NextResponse.next()`, logged via `console.error`.

`localesSet` (exported `Set` built from `config.locales`) is the single
source of truth for "is this a configured locale" — reused in
`get_user_locale.ts` and transitively in `server/functions/server.ts` /
`use_functions.ts`. Don't duplicate this check.

## `general/general_functions.ts` — 3 confirmed-dead branches, do not "fix"

`getTranslationsImpl(locale, messages, namespace, cacheKey?)` walks a nested
object by dot-separated namespace, then returns a translator walking further
by dot-separated key. Three branches are proven unreachable by manual
control-flow trace (not just "untested"): the post-loop
`if (!translationsBase)` check, the `typeof currentTranslation === 'string'`
guard in the key loop, and the key-loop's exit fallback. These are NOT
marked with `v8 ignore` — an earlier attempt at that was reverted after one
of five originally-claimed-dead branches turned out reachable (the
`namespace ? ... : ''` ternary IS reachable via an empty-string namespace).
See [testing.md](testing.md) for the coverage-threshold workaround. If asked
to "clean up" this file: removing the dead branches is a legitimate
simplification, but as its own isolated, flagged change — never bundled
into unrelated work, since the coverage config has an exact-count override
tied to it.

## `metadata.ts` / `intl_sitemap.ts`

Thin, `cache()`-wrapped helpers for `generateMetadata`/`sitemap.ts`.
`iAlternatesLinks` swallows internal errors (try/catch → `console.error` →
`undefined`) rather than throwing — a broken canonical-URL calc shouldn't
500 a page.

# Config & General — locale routing, middleware, translation resolution

Covers `package/src/config/**` and `package/src/general/**`.

## The `@intl-config` alias is load-bearing

`package/src/config/intl_config.ts` does `import intlConfig from '@intl-config'`
— this is a path alias (see `package/tsconfig.json`'s `paths`) that consumers
map to their own config file (created via `setIntlConfig`, `init_config.ts`).
It is NOT a real npm package. If it resolves to nothing, `getConfig()` throws
`Error('Please set config file...')` at **module load time** (the throw is
inside a top-level `const config = getConfig();`), so importing
`intl_config.ts` at all can throw synchronously.

**For tests:** `package/vitest.config.ts` aliases `@intl-config` to
`package/src/test_utils/mock_intl_config.ts` (locales `['en', 'de']`,
default `'en'`). To test the throw branch itself, you must
`vi.resetModules()` + `vi.doMock('@intl-config', ...)` + dynamic `import()` —
a static `import` at the top of a test file runs before the mock is wired up.

Same pattern for `@locale-file` → aliased to
`package/src/test_utils/mock_locale_file/{en,de}.json` in tests; in real
usage it maps to the consumer's actual translation JSON files, loaded via
`import(\`@locale-file/${locale}.json\`)` (dynamic import, in
`server/functions/server.ts`).

## `intlMiddleware` (`config/middleware.ts`) — the core routing function

Single exported default function, does A LOT in one pass:

1. Resolves the locale: cookie (if valid) → bot detection (via
   `next/dist/server/web/spec-extension/user-agent`'s `isBot`, dynamically
   imported) → `accept-language` header parsing (delegated to
   `server/functions/get_user_locale.ts`'s `languageDetecotr`, sic — typo in
   the name is intentional/existing, don't "fix" it without checking all
   call sites).
2. Decides rewrite vs. redirect vs. pass-through based on whether the URL
   already has a locale prefix and whether the resolved locale is the
   *default* locale (default locale is served unprefixed via rewrite; any
   other locale gets a visible redirect).
3. Calls the optional `middlewareHandler` callback (this is the **extension
   point** for consumer apps — see `types/types.ts`'s `MiddlewareCustomHandler`
   doc comment for the exact contract: at most one of `rewriteUrl`/`redirectUrl`
   is ever set, and the handler decides what to do with each case). By
   default the handler does NOT run on the redirect path — only pass
   `runHandlerOnRedirect: true` to change that.
4. Sets the locale cookie (only if changed) and a bot-detection cookie
   (`isBotCookieKey`), then `Content-Language` header.
5. Wraps everything in try/catch — any internal error falls back to a bare
   `NextResponse.next()`, logged via `console.error('Middleware Error ...')`.

`localesSet` (a `Set` built from `config.locales`) is exported from this file
and re-used elsewhere (`get_user_locale.ts`, `server/functions/server.ts`,
`server/functions/use_functions.ts` transitively) — it's the single source of
truth for "is this a configured locale," don't duplicate the check.

## `general/general_functions.ts` — translation resolution has 3 confirmed-dead branches

`getTranslationsImpl(locale, messages, namespace, cacheKey?)` walks a nested
`TranslationObject` by dot-separated `namespace`, then returns a translator
function that walks further by dot-separated `key`. During Phase 1 test-
coverage work, a reviewer traced the function line-by-line and confirmed
**3 specific branches are genuinely unreachable dead code** given the
function's own control flow (not just "untested" — provably unreachable by
any input):

- The post-loop `if (!translationsBase)` check (the loop above it always
  either returns early or sets `translationsBase`).
- The `typeof currentTranslation === 'string'` guard at the top of the inner
  key-traversal loop (`currentTranslation` is only ever reassigned under an
  explicit object-type guard).
- The loop-exit fallback at the end of the inner key-traversal loop (the
  loop's last iteration always `return`s).

These are **NOT** marked with `v8 ignore` comments in the source — an
earlier attempt to do that was reverted after a reviewer found one of the
five originally-claimed-unreachable branches was actually wrong (the
`namespace ? ... : ''` ternary in `errorAndReturnFallback` IS reachable via
an empty-string `namespace` argument — `''.split('.')` still produces one
loop iteration). See [`docs/ai/testing.md`](testing.md) for how the coverage
threshold accounts for this without touching the source.

**If you're asked to "clean up" this file:** removing the 3 dead branches
would be a genuine simplification, but do it as a deliberate, isolated
change — not bundled into unrelated work — since the coverage config has a
specific override tied to today's exact reachable-branch count.

## `intl_sitemap.ts` and `metadata.ts`

Both are thin, `cache()`-wrapped helpers for Next's `generateMetadata` /
`sitemap.ts` conventions — no surprising branches, mostly string-building
over `config.locales`. `metadata.ts`'s `iAlternatesLinks` swallows internal
errors (try/catch → `console.error` → `undefined`) rather than throwing —
intentional, since a broken canonical-URL calculation shouldn't 500 a page.

## `get_layout_states.ts` is dead code, don't touch

Entirely commented out (was disabled deliberately, per the file's own header
comment). `package.json`'s `exports` map still lists a
`./getLayoutStates` subpath pointing at it, but importing it currently
resolves to a module with zero runtime exports. Excluded from the coverage
config's `include` set for exactly this reason. Don't "helpfully" delete the
commented code or re-enable it without checking with a human first — the
header comment explains why it was turned off.

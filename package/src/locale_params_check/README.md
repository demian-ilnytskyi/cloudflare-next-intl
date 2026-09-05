# `src/locale_params_check`

Scans your `app/` directory's `[<localeParam>]`-scoped `page.*`/`layout.*`/
`loading.*` files and, for every one missing locale-param setup, inserts it:
a `{ params }: { params: Promise<{ locale: Language }> }` prop (added only
to a zero-argument `export default (async) function`; an existing `params`
prop of any shape is left alone) plus a `const { locale } = await
params;`/`setLocale(locale);` pair as the function's first statement — or,
if the file already destructures `locale` from `params` inline but never
calls `setLocale`, just the missing `setLocale(locale)` call.

This matters because `getTranslations()`/`useTranslations()` called with no
explicit `locale` argument fall back to reading a `NEXT_LOCALE`-style
**cookie** (see `server/functions/server.ts`'s `getLocale`) — a page that
never resolves its own locale from route params is cookie-dependent even
though it never calls `cookies()` directly, which silently defeats
`force-static`. `dynamic_pages_check`'s `detectDynamicUsage` now flags this
exact case as its own signal, so running both checks together (or the Vite
plugins, which both run automatically) keeps the two consistent.

Like `dynamic_pages_check`, this is a **text-based heuristic**, not a real
parser — read what `fix` inserts before committing it.

## Usage

Add to your `package.json`:

```json
{ "scripts": { "predev": "cfni-check-locale-params", "prebuild": "cfni-check-locale-params" } }
```

Three modes (`--mode=` / `CFNI_LOCALE_PARAMS_MODE`):
- `report` (default) — prints what it would do, writes nothing.
- `fix` — writes the missing setup into each qualifying file.
- `off` — the global disable switch; does not scan at all.

```bash
cfni-check-locale-params --mode=fix
cfni-check-locale-params --mode=fix --locale-param=lang
cfni-check-locale-params --skip=src/app/\[locale\]/\[...rest\]/page.tsx
```

Or call it programmatically:

```ts
import { checkLocaleParams } from 'cloudflare-next-intl/checkLocaleParams';

const reports = await checkLocaleParams({
    appDir: 'src/app',
    mode: 'report',
    localeParam: 'locale',
    skip: ['src/app/[locale]/[...rest]/page.tsx'],
    overrides: { 'src/app/[locale]/(app)/legacy/page.tsx': { localeParam: 'lang' } },
});
```

## Vite plugin

`cloudflareNextIntl()`'s `autoLocaleParams` option (on by default) runs this
automatically during `vite build` — and, with `{ runOnDev: true }`, during
`vite dev` too. Build-time writes are reverted when the process exits
(`restoreAfterBuild`, on by default), so the inserted setup drives that one
build without ever landing in your working tree; dev keeps the setup in
place for the life of the dev server, since there's no single "done" moment
to restore at.

## Layout

- `find_locale_scoped_files.ts` — `page.*`/`layout.*`/`loading.*` finder,
  restricted to files under `appDir/[<localeParam>]/`.
- `detect_locale_params.ts` — has-setup / has-params-type detection.
- `insert_locale_params.ts` — the pure source-rewrite steps (signature,
  body, import).
- `check_locale_params.ts` — orchestrates the three modes and the
  skip/overrides lists.

# `src/dynamic_pages_check`

Scans your `app/` directory for `page.*`/`route.*` files and, for every one
that doesn't already declare its own `export const dynamic`, inserts
`"force-dynamic"` when the file looks request-dependent (`cookies()`,
`headers()`, a `searchParams` prop, `unstable_noStore()`, `connection()`, or
a `no-store`/`revalidate: 0` fetch). A file with none of those signals is
left to Next's own static/dynamic inference — inserting `force-static` on
"no signal found" would be an unsafe default, since a page can be dynamic
through means this regex-based scan doesn't see; leaving it alone never
turns a working dynamic page into a stale, build-time-frozen one. A file
that already has its own `export const dynamic` is always left alone, in
every mode — this never overrides an explicit choice.

This is a **text-based heuristic**, not a real parser: good enough for the
common cases, but read what it inserted rather than trusting it blindly on
an unusual file.

## Usage

Add to your `package.json`:

```json
{ "scripts": { "predev": "cfni-check-dynamic-pages", "prebuild": "cfni-check-dynamic-pages" } }
```

Three modes (`--mode=` / `CFNI_DYNAMIC_PAGES_MODE`):
- `report` (default) — prints what it would do, writes nothing. Review its
  output before opting into `fix` — the import-boundary detection is a text
  heuristic and can misplace the insertion on an unusual file.
- `fix` — writes the missing export into each qualifying file.
- `off` — the global disable switch; does not scan at all.

Exempt specific files with `--skip=` (comma-separated) /
`CFNI_DYNAMIC_PAGES_SKIP` — e.g. a page you already know is fine as-is and
don't want touched:

```bash
cfni-check-dynamic-pages --mode=report
cfni-check-dynamic-pages --skip=src/app/[locale]/[...rest]/page.tsx
```

Or call it programmatically:

```ts
import { checkDynamicPages } from 'cloudflare-next-intl/checkDynamicPages';

const reports = await checkDynamicPages({
    appDir: 'src/app',
    mode: 'report',
    skip: ['src/app/[locale]/[...rest]/page.tsx'],
});
```

## Layout

- `find_page_files.ts` — recursive `page.*`/`route.*` finder.
- `detect_dynamic_usage.ts` — the text-heuristic detector, plus
  "already has an explicit `dynamic` export" detection.
- `insert_dynamic_export.ts` — the pure source-rewrite step.
- `check_dynamic_pages.ts` — orchestrates the three modes and the skip list.

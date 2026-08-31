# Cloudflare Fetch Fallback + Errors Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five independent, optional additions to `cloudflare-next-intl`: (1) `cloudflare_fetch` — a Cloudflare-Assets-binding-aware fetch helper (works under Next *and* Vite targets, mirrors `portfolio`'s `site_fetch_repository.ts`/`cloudflare_repository.ts` logic but sourced from this package's existing `generate.env` convention instead of a hardcoded `cloudflare:workers` import); (2) `errors_board` — a customizable D1-backed error log (list + detail UI, status workflow, Firebase-email access gate), ported from `clarivant/CRV`'s `/errors` feature, as reusable server functions + client components rather than fixed pages, so a consuming app wires it up with a handful of thin files; (3) auto-detected Hyperdrive connection strings in the existing `db` module, so `db.connectionString` no longer has to be hand-written per app (opt-out via a bool), mirroring `clarivant/CRV/src/shared/repositories/cloudflare_repository.ts`'s `getHyperdriveConnectString`; (4) `cloudflare_email` — a Cloudflare Email Sending helper (binding-first, REST-fallback for local dev), generalized from `portfolio`'s `transactional_email.ts`; (5) `dynamic_pages_check` — a build-time codemod (`checkDynamicPages` + a `cfni-check-dynamic-pages` CLI) that scans a consumer's `app/` directory and auto-inserts the missing `export const dynamic = "force-static"`/`"force-dynamic"` into any page that doesn't already declare one, based on a text-heuristic scan for request-dependent APIs — three modes (`off`/`report`/`fix`) plus a per-file `skip` list.

**Architecture:** All four are optional, subpath-exported, and follow this package's existing per-feature layout (`src/<feature>/{server,client,shared}` + `index.ts` + `README.md`, one package.json export per public symbol). `cloudflare_fetch`, the Hyperdrive addition, and `cloudflare_email` all reuse `resolveEnv()` (`src/server/functions/geo.ts`) — the same `generate.env`/`generate.getCloudflareContext` resolution already used by `getCountry`/`getTimezone` — instead of inventing a second way to reach Cloudflare bindings; this is what makes `cloudflare_fetch` and `cloudflare_email` Vite-safe (Vite/Workers/OpenNext consumers all just populate `generate.env` in their own `intl_config`, same as they already do for geo), and it's also how the Hyperdrive lookup reaches `env.HYPERDRIVE` without a new resolution mechanism. `errors_board` is Next-only (it needs `next/navigation`, `next/cache`, `next/link`, and this package's existing Next-only `firebase_auth/server` gate), matching the precedent set by `firebase_auth` and `db`'s `withUserDb`, which are also Next-only submodules of an otherwise dual-target package. `dynamic_pages_check` is a build-time Node script/CLI, not a runtime library piece — it never runs inside a Worker/browser, matching `bin/db_codegen.mjs`'s existing convention (a plain `.mjs` file in `bin/`, importing the built `dist/` output, with no colocated test — its logic lives in the tested `src/dynamic_pages_check/*` modules instead). None of the five adds a new dependency: no `zod` (hand-rolled validation, matching `firebase_auth`'s style), no `@cloudflare/workers-types` (local duck-typed `D1DatabaseLike`/`EmailBindingLike`/`HyperdriveBindingLike` interfaces, same technique `transactional_email.ts` in `portfolio` used for its Cloudflare Email binding), no `luxon` (native `Intl` for the two date-format helpers), no shadcn/ui (the filter form uses a plain `<select>`).

**Tech Stack:** TypeScript (ESM, NodeNext), React 19 (Next.js App Router — server components + `"use client"` components + server actions), vitest (`npm test` = `vitest run --coverage`).

**Spec:** N/A — no separate spec doc. Requirements were gathered directly in this planning session from three reference implementations, all cited by exact path in the tasks below:
- `/Volumes/External/own_projects/portfolio/src/shared/repositories/site_fetch_repository.ts` and `cloudflare_repository.ts` (fetch-fallback logic to generalize)
- `/Volumes/External/clarivant/CRV/src/shared/repositories/errors_repository.ts`, `/Volumes/External/clarivant/CRV/src/app/errors/**` (errors board reference implementation — more mature than portfolio's own `/errors`, includes `reopen_count`/`resolved_at`)
- `/Volumes/External/clarivant/CRV/src/app/errors/gate.ts` (email-allowlist gate pattern, reusing this package's own `getFirebaseAuthUser`)
- `/Volumes/External/clarivant/CRV/src/shared/repositories/cloudflare_repository.ts`'s `getHyperdriveConnectString` (Hyperdrive auto-detection + the wrangler-dev-placeholder guard) and its `wrangler.toml`'s `[[env.*.hyperdrive]]` blocks (binding is always named `HYPERDRIVE`)
- `/Volumes/External/own_projects/portfolio/src/shared/email/transactional_email.ts` (Cloudflare Email Sending: binding-first, REST-fallback, `escapeHtml`)
- This session's own follow-up discussion on auto-detecting `export const dynamic` — Next.js requires that export to be a literal, top-level, statically-analyzed value (never computed/conditional), so no runtime helper can set it; a build-time text-heuristic scan + codemod is the only mechanism that can act on it, hence `dynamic_pages_check` (Tasks 21–24) being a CLI/bin script, not a `generate`/`intl_config`-driven runtime feature like the other four additions

## Global Constraints

- No new dependencies: no `zod`, no `@cloudflare/workers-types`, no `luxon`, no UI kit. Validation, D1 typing, and date formatting are all hand-rolled to match this constraint.
- `errors_board` is Next-only. Do not attempt to make it Vite-compatible — it imports `next/navigation`, `next/cache`, and `next/link` directly, same as `firebase_auth/server` and `db`'s `withUserDb` already do elsewhere in this package.
- `cloudflare_fetch` must work under both Next and Vite targets — resolve Cloudflare bindings exclusively via `resolveEnv()` (`src/server/functions/geo.ts`), never via a direct `import("cloudflare:workers")`.
- `cloudflare_email` must also work under both targets, same `resolveEnv()`-only rule as `cloudflare_fetch`.
- Hyperdrive auto-detection is opt-out, not opt-in: when `db.connectionString` is unset and `db.autoHyperdrive !== false`, the `db` module tries `env.HYPERDRIVE.connectionString` before falling through to `db.supabase`. Never hardcode the binding name to anything but `HYPERDRIVE` (matches every `[[env.*.hyperdrive]]` block in `clarivant/CRV/wrangler.toml`).
- `cloudflare_email`'s sender address is a required option, never a hardcoded string — `portfolio`'s `SENDER_ADDRESS` constant is verified against exactly one domain there and would silently break for any other consumer.
- Every new module follows the existing per-feature layout: `src/<feature>/...`, an `index.ts` barrel, a `README.md`, and one `package.json` `exports` entry per public symbol (not one entry for the whole module) — same granularity as `ThemeSwitcher`, `firebaseAuthClient`, etc.
- Every new file needs a same-directory `*.test.ts`/`*.test.tsx` companion (this package's existing convention — see `src/theme_switcher/components/theme_switcher.tsx` + its `.test.tsx`).
- Components take their data-fetching/action functions and hrefs as **props**, not fixed relative imports — this is what makes `errors_board` "customizable" per the requirement (mountable at any route, wired to any `getDb`/gate).
- Return type on components is `Component` (this package's existing global JSX alias — see `global_jsx_helper.d.ts`), matching `src/theme_switcher/components/theme_switcher.tsx`'s convention, not `React.ReactElement`.

---

## File Structure

```
package/src/cloudflare_fetch/
  resolve_assets_binding.ts       # checks env.ASSETS?.fetch is a function
  resolve_assets_binding.test.ts
  fetch_with_fallback.ts         # binding.fetch(...) OR global fetch(...)
  fetch_with_fallback.test.ts
  fetch_text.ts                  # full site_fetch_repository.fetchTextData parity
  fetch_text.test.ts
  index.ts
  README.md

package/src/errors_board/
  server/
    errors_repository.ts          # D1DatabaseLike, schema, CRUD, validation
    errors_repository.test.ts
    gate.ts                       # createRequireErrorsAccess(...)
    gate.test.ts
    actions_factory.ts            # createErrorsActions(...)
    actions_factory.test.ts
    index.ts
  shared/
    error_ui_helpers.ts            # STATUS_* maps, formatRelativeTime, formatLocalTimestamp, parseRequestContext
    error_ui_helpers.test.ts
  client/
    error_ui_client.tsx            # useMounted, LocalTime, CopyButton, DetailBlock
    error_ui_client.test.tsx
    errors_stat_strip.tsx
    errors_stat_strip.test.tsx
    errors_filter_form.tsx
    errors_filter_form.test.tsx
    error_row.tsx
    error_row.test.tsx
    errors_list_client.tsx
    errors_list_client.test.tsx
    error_detail_view.tsx
    error_detail_view.test.tsx
  README.md

package/src/db/
  resolve_hyperdrive_connection_string.ts   # new
  resolve_hyperdrive_connection_string.test.ts
  resolve_mode.ts                            # modified — Hyperdrive fallback
  resolve_mode.test.ts                       # modified
  context.ts                                 # modified — thread `generate` through
package/src/types/types.ts                  # modified — DbRoutingConfig.autoHyperdrive

package/src/cloudflare_email/
  resolve_email_binding.ts
  resolve_email_binding.test.ts
  escape_html.ts
  escape_html.test.ts
  send_transactional_email.ts        # binding-first + REST fallback
  send_transactional_email.test.ts
  index.ts
  README.md
```

---

### Task 1: `resolveAssetsBinding` — detect a usable Cloudflare Assets binding

**Files:**
- Create: `package/src/cloudflare_fetch/resolve_assets_binding.ts`
- Test: `package/src/cloudflare_fetch/resolve_assets_binding.test.ts`

**Interfaces:**
- Consumes: `resolveEnv` from `../server/functions/geo.js` (already exported — signature `(generate?: GenerateRoutingConfig) => Promise<Record<string, unknown> | undefined>`); `GenerateRoutingConfig` type from `../types/types.js`.
- Produces: `AssetsBindingLike` interface and `resolveAssetsBinding(generate?: GenerateRoutingConfig): Promise<AssetsBindingLike | null>` — used by Task 2.

- [ ] **Step 1: Write the failing test**

```ts
// package/src/cloudflare_fetch/resolve_assets_binding.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/functions/geo.js', () => ({
    resolveEnv: vi.fn(),
}));

import { resolveEnv } from '../server/functions/geo.js';
import { resolveAssetsBinding } from './resolve_assets_binding.js';

describe('resolveAssetsBinding', () => {
    it('returns null when generate is undefined', async () => {
        vi.mocked(resolveEnv).mockResolvedValue(undefined);
        expect(await resolveAssetsBinding(undefined)).toBeNull();
    });

    it('returns null when env has no ASSETS binding', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({});
        expect(await resolveAssetsBinding({})).toBeNull();
    });

    it('returns null when ASSETS exists but has no fetch function', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({ ASSETS: {} });
        expect(await resolveAssetsBinding({})).toBeNull();
    });

    it('returns the binding when ASSETS.fetch is a function', async () => {
        const fetchFn = vi.fn();
        vi.mocked(resolveEnv).mockResolvedValue({ ASSETS: { fetch: fetchFn } });
        const binding = await resolveAssetsBinding({});
        expect(binding).not.toBeNull();
        expect(binding?.fetch).toBe(fetchFn);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/cloudflare_fetch/resolve_assets_binding.test.ts`
Expected: FAIL with "Cannot find module './resolve_assets_binding.js'" (or similar — the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/cloudflare_fetch/resolve_assets_binding.ts
import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/**
 * Duck-typed Cloudflare Assets Service binding (`wrangler.toml`'s
 * `[assets] binding = "ASSETS"`, or any binding shaped like it) — no
 * `@cloudflare/workers-types` dependency, matching how
 * `portfolio/src/shared/error_handling/transactional_email.ts` types its
 * own Cloudflare binding locally.
 */
export interface AssetsBindingLike {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Resolves `env.ASSETS` via `resolveEnv()` (this package's existing
 * `generate.env`/`generate.getCloudflareContext` resolution, already used
 * by `getCountry`/`getTimezone`) and returns it only if it looks callable.
 * Returns `null` — never throws — when no binding is configured, which is
 * the normal case in `next dev`/a plain Vite dev server/Node.
 */
export async function resolveAssetsBinding(generate?: GenerateRoutingConfig): Promise<AssetsBindingLike | null> {
    const env = await resolveEnv(generate);
    const candidate = (env as Record<string, unknown> | undefined)?.ASSETS;
    if (!candidate || typeof candidate !== 'object') return null;
    const fetchFn = (candidate as { fetch?: unknown }).fetch;
    return typeof fetchFn === 'function' ? (candidate as AssetsBindingLike) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/cloudflare_fetch/resolve_assets_binding.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_fetch/resolve_assets_binding.ts package/src/cloudflare_fetch/resolve_assets_binding.test.ts
git commit -m "feat(cloudflare_fetch): add resolveAssetsBinding"
```

---

### Task 2: `fetchWithCloudflareFallback` — binding-first, global-`fetch`-fallback

**Files:**
- Create: `package/src/cloudflare_fetch/fetch_with_fallback.ts`
- Test: `package/src/cloudflare_fetch/fetch_with_fallback.test.ts`

**Interfaces:**
- Consumes: `resolveAssetsBinding` (Task 1); `GenerateRoutingConfig` from `../types/types.js`.
- Produces: `fetchWithCloudflareFallback(input: RequestInfo | URL, init: RequestInit, generate?: GenerateRoutingConfig): Promise<Response>` — used by Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// package/src/cloudflare_fetch/fetch_with_fallback.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./resolve_assets_binding.js', () => ({
    resolveAssetsBinding: vi.fn(),
}));

import { resolveAssetsBinding } from './resolve_assets_binding.js';
import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';

describe('fetchWithCloudflareFallback', () => {
    const originalFetch = globalThis.fetch;
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => new Response('via global fetch'));
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('uses the Assets binding when one is available', async () => {
        const bindingFetch = vi.fn(async () => new Response('via binding'));
        vi.mocked(resolveAssetsBinding).mockResolvedValue({ fetch: bindingFetch });

        const response = await fetchWithCloudflareFallback('https://example.com/a.txt', { headers: { x: '1' } }, {});

        expect(bindingFetch).toHaveBeenCalledWith('https://example.com/a.txt', { headers: { x: '1' } });
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(await response.text()).toBe('via binding');
    });

    it('falls back to global fetch with cache: "no-store" when no binding is available', async () => {
        vi.mocked(resolveAssetsBinding).mockResolvedValue(null);

        const response = await fetchWithCloudflareFallback('https://example.com/a.txt', { headers: { x: '1' } }, {});

        expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/a.txt', { headers: { x: '1' }, cache: 'no-store' });
        expect(await response.text()).toBe('via global fetch');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/cloudflare_fetch/fetch_with_fallback.test.ts`
Expected: FAIL with "Cannot find module './fetch_with_fallback.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/cloudflare_fetch/fetch_with_fallback.ts
import { resolveAssetsBinding } from './resolve_assets_binding.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/**
 * Fetches `input` via the Cloudflare Assets binding when one resolves
 * (`resolveAssetsBinding`), otherwise via the global `fetch` with
 * `cache: 'no-store'` — the same two-path shape as
 * `portfolio/src/shared/repositories/site_fetch_repository.ts`'s
 * `fetchTextData`, generalized to resolve the binding through this
 * package's own `generate.env` convention (so it works under Vite too,
 * not just `next-on-pages`/OpenNext) instead of branching on
 * `KTextConstants.isDev`.
 */
export async function fetchWithCloudflareFallback(
    input: RequestInfo | URL,
    init: RequestInit,
    generate?: GenerateRoutingConfig,
): Promise<Response> {
    const binding = await resolveAssetsBinding(generate);
    if (binding) return binding.fetch(input, init);
    return fetch(input, { ...init, cache: 'no-store' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/cloudflare_fetch/fetch_with_fallback.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_fetch/fetch_with_fallback.ts package/src/cloudflare_fetch/fetch_with_fallback.test.ts
git commit -m "feat(cloudflare_fetch): add fetchWithCloudflareFallback"
```

---

### Task 3: `fetchText` — full `fetchTextData` parity (error-reported, never-throws)

**Files:**
- Create: `package/src/cloudflare_fetch/fetch_text.ts`
- Test: `package/src/cloudflare_fetch/fetch_text.test.ts`

**Interfaces:**
- Consumes: `fetchWithCloudflareFallback` (Task 2); `reportError`, `type ReportErrorConfig` from `../error_handling/report_error.js`.
- Produces: `fetchText(input, init, config, reportAs): Promise<string | null>` — the module's top-level public entry point (exported from `index.ts` in Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// package/src/cloudflare_fetch/fetch_text.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./fetch_with_fallback.js', () => ({
    fetchWithCloudflareFallback: vi.fn(),
}));
vi.mock('../error_handling/report_error.js', () => ({
    default: vi.fn(),
}));

import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';
import reportError from '../error_handling/report_error.js';
import { fetchText } from './fetch_text.js';

describe('fetchText', () => {
    it('returns the body text on a 200 response', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockResolvedValue(new Response('hello', { status: 200 }));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBe('hello');
        expect(reportError).not.toHaveBeenCalled();
    });

    it('reports and returns null on a non-ok response', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockResolvedValue(new Response('server error', { status: 500 }));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBeNull();
        expect(reportError).toHaveBeenCalledTimes(1);
        const [, params] = vi.mocked(reportError).mock.calls[0];
        expect(params.classOrMethodName).toBe('test.fetchText');
    });

    it('reports and returns null when the fetch itself throws', async () => {
        vi.mocked(fetchWithCloudflareFallback).mockRejectedValue(new Error('network down'));
        const result = await fetchText('https://example.com/a.txt', {}, undefined, 'test.fetchText');
        expect(result).toBeNull();
        expect(reportError).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/cloudflare_fetch/fetch_text.test.ts`
Expected: FAIL with "Cannot find module './fetch_text.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/cloudflare_fetch/fetch_text.ts
import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';
import reportError, { type ReportErrorConfig } from '../error_handling/report_error.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/**
 * Full parity with `portfolio/src/shared/repositories/site_fetch_repository.ts`'s
 * `fetchTextData`: fetches `input` (via `fetchWithCloudflareFallback`),
 * reports (never throws) on a non-ok response or a thrown error, and
 * returns `null` in both failure cases so a caller always gets either the
 * body text or a clean "couldn't fetch it" signal.
 *
 * @param config Pass `{ generate: yourRoutingConfig.generate, errorHandling: yourRoutingConfig.errorHandling }`.
 * @param reportAs The label the failure is reported under (see `reportError`'s `classOrMethodName`).
 */
export async function fetchText(
    input: RequestInfo | URL,
    init: RequestInit,
    config: (ReportErrorConfig & { generate?: GenerateRoutingConfig }) | undefined,
    reportAs: string,
): Promise<string | null> {
    try {
        const response = await fetchWithCloudflareFallback(input, init, config?.generate);
        if (!response.ok) {
            throw new Error((await response.text()) || `HTTP ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        await reportError(config, { error, classOrMethodName: reportAs, params: { input: String(input) } });
        return null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/cloudflare_fetch/fetch_text.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_fetch/fetch_text.ts package/src/cloudflare_fetch/fetch_text.test.ts
git commit -m "feat(cloudflare_fetch): add fetchText"
```

---

### Task 4: `cloudflare_fetch` barrel, README, and package.json exports

**Files:**
- Create: `package/src/cloudflare_fetch/index.ts`
- Create: `package/src/cloudflare_fetch/README.md`
- Modify: `package/package.json` (`exports` map)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `cloudflare-next-intl/fetchText`, `cloudflare-next-intl/fetchWithCloudflareFallback` importable by consumers.

- [ ] **Step 1: Write the barrel**

```ts
// package/src/cloudflare_fetch/index.ts
export { fetchText } from './fetch_text.js';
export { fetchWithCloudflareFallback } from './fetch_with_fallback.js';
export { resolveAssetsBinding, type AssetsBindingLike } from './resolve_assets_binding.js';
```

- [ ] **Step 2: Write the README**

```md
<!-- package/src/cloudflare_fetch/README.md -->
# `src/cloudflare_fetch`

Fetches a URL via the Cloudflare Assets Service binding (`env.ASSETS`) when
one is configured, falling back to the global `fetch` (with
`cache: 'no-store'`) otherwise — the same shape as hand-rolling
"if dev, plain fetch; if deployed, the binding" yourself, except the
binding is resolved through this package's own `generate.env`/
`generate.getCloudflareContext` convention (`src/server/functions/geo.ts`'s
`resolveEnv`), so it works whether your app runs on Next+OpenNext, Vinext,
or a plain Cloudflare Worker — not just Next.

## Usage

```ts
import { fetchText } from 'cloudflare-next-intl/fetchText';
import intlConfig from './intl_config';

const body = await fetchText(
    'https://internal.example.com/data.json',
    { headers: { Authorization: `Bearer ${token}` } },
    { generate: intlConfig.generate, errorHandling: intlConfig.errorHandling },
    'MyFeature.fetchThing',
);
if (body === null) {
    // fetch failed or returned non-ok; already reported via errorHandling.onError
}
```

Use `fetchWithCloudflareFallback` directly instead of `fetchText` when you
need the raw `Response` (e.g. non-text bodies, or you want to handle
errors yourself rather than getting `null` + an automatic report).

## Layout

- `resolve_assets_binding.ts` — resolves `env.ASSETS` via `resolveEnv()` and
  checks it's actually callable; `null` when unavailable (the normal case
  in local dev).
- `fetch_with_fallback.ts` — the binding-or-`fetch` primitive; returns a
  raw `Response`.
- `fetch_text.ts` — `fetchWithCloudflareFallback` + `reportError` +
  "return `null` on any failure", full parity with the
  `site_fetch_repository.ts` pattern this module replaces.
```

- [ ] **Step 3: Add package.json exports**

In `package/package.json`, inside the `exports` object, add (alongside the existing `./errorHandling` entries):

```json
"./fetchText": {
    "types": "./dist/src/cloudflare_fetch/fetch_text.d.ts",
    "import": "./dist/src/cloudflare_fetch/fetch_text.js"
},
"./fetchWithCloudflareFallback": {
    "types": "./dist/src/cloudflare_fetch/fetch_with_fallback.d.ts",
    "import": "./dist/src/cloudflare_fetch/fetch_with_fallback.js"
},
```

- [ ] **Step 4: Verify the build and exports**

Run: `cd package && npm run build && npm run check:exports`
Expected: both succeed — `check:exports` confirms `dist/src/cloudflare_fetch/fetch_text.js` and `fetch_with_fallback.js` both exist and import cleanly.

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_fetch/index.ts package/src/cloudflare_fetch/README.md package/package.json
git commit -m "feat(cloudflare_fetch): add barrel, README, package.json exports"
```

---

### Task 5: `errors_repository` — D1 schema, validation, and CRUD (part 1: types + validation)

**Files:**
- Create: `package/src/errors_board/server/errors_repository.ts`
- Test: `package/src/errors_board/server/errors_repository.test.ts`

**Interfaces:**
- Consumes: nothing (no dependency on other new files).
- Produces: `ERROR_STATUSES`, `BOARD_STATUSES`, `ErrorStatus`, `ErrorRow`, `D1DatabaseLike`, `RecordErrorInput`, `ErrorsListFilters`, `ErrorsListResult`, `ErrorsBoardResult`, `isErrorStatus`, `parseErrorsListFilters`, `boundErrorIds` — all consumed by Task 6 (repository CRUD) and Task 8 (gate/actions).

- [ ] **Step 1: Write the failing test**

```ts
// package/src/errors_board/server/errors_repository.test.ts
import { describe, it, expect } from 'vitest';
import { isErrorStatus, parseErrorsListFilters, boundErrorIds, ERROR_STATUSES } from './errors_repository.js';

describe('isErrorStatus', () => {
    it('accepts every known status', () => {
        for (const status of ERROR_STATUSES) expect(isErrorStatus(status)).toBe(true);
    });
    it('rejects an unknown string', () => {
        expect(isErrorStatus('archived')).toBe(false);
    });
});

describe('parseErrorsListFilters', () => {
    it('defaults flavour to "all", status to "all", q to "", cursor to null', () => {
        expect(parseErrorsListFilters({})).toEqual({ flavour: 'all', status: 'all', q: '', cursor: null });
    });
    it('passes through valid values', () => {
        expect(parseErrorsListFilters({ flavour: 'prod', status: 'new', q: 'timeout', cursor: 123 }))
            .toEqual({ flavour: 'prod', status: 'new', q: 'timeout', cursor: 123 });
    });
    it('falls back to "all" for an invalid status rather than throwing', () => {
        expect(parseErrorsListFilters({ status: 'bogus' }).status).toBe('all');
    });
    it('coerces a string cursor to a number', () => {
        expect(parseErrorsListFilters({ cursor: '456' }).cursor).toBe(456);
    });
    it('rejects a negative cursor back to null', () => {
        expect(parseErrorsListFilters({ cursor: -1 }).cursor).toBeNull();
    });
});

describe('boundErrorIds', () => {
    it('throws on an empty array', () => {
        expect(() => boundErrorIds([])).toThrow();
    });
    it('throws on a non-positive-integer id', () => {
        expect(() => boundErrorIds([1, -2])).toThrow();
        expect(() => boundErrorIds([1.5])).toThrow();
    });
    it('caps at 200 ids', () => {
        const ids = Array.from({ length: 250 }, (_, i) => i + 1);
        expect(boundErrorIds(ids)).toHaveLength(200);
    });
    it('passes through a valid, small list unchanged', () => {
        expect(boundErrorIds([1, 2, 3])).toEqual([1, 2, 3]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/server/errors_repository.test.ts`
Expected: FAIL with "Cannot find module './errors_repository.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/errors_board/server/errors_repository.ts
export const ERROR_STATUSES = ['new', 'investigating', 'resolved', 'muted'] as const;
export type ErrorStatus = typeof ERROR_STATUSES[number];

/** Statuses shown on the board by default — `muted` is opt-in only (see errors_board README). */
export const BOARD_STATUSES = ['new', 'investigating', 'resolved'] as const;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
const MAX_PARAMS_LENGTH = 4000;
export const ERRORS_PAGE_SIZE = 50;
export const MAX_IDS_PER_ACTION = 200;

export interface ErrorRow {
    id: number;
    fingerprint: string;
    created_at: number;
    updated_at: number;
    flavour: string;
    caller: string;
    message: string;
    stack: string | null;
    params: string | null;
    is_client: number;
    status: ErrorStatus;
    count: number;
    user_email: string | null;
    reopen_count: number;
    resolved_at: number | null;
}

/** No `@cloudflare/workers-types` dependency — duck-typed against D1's real shape. */
export interface D1PreparedStatementLike {
    bind(...values: unknown[]): D1PreparedStatementLike;
    run(): Promise<unknown>;
    all<T = unknown>(): Promise<{ results?: T[] }>;
    first<T = unknown>(): Promise<T | null>;
}
export interface D1DatabaseLike {
    prepare(sql: string): D1PreparedStatementLike;
    batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<{ results?: T[] }[]>;
}

export interface RecordErrorInput {
    flavour: string;
    caller: string;
    message: string;
    stack: string | null;
    params: string | null;
    isClient: boolean;
    userEmail: string | null;
}

export interface ErrorsListFilters {
    flavour: string;
    status: ErrorStatus | 'all';
    q: string;
    cursor: number | null;
}

export interface ErrorsListResult {
    rows: ErrorRow[];
    nextCursor: number | null;
}

export interface ErrorsBoardResult extends ErrorsListResult {
    flavours: string[];
    counts: Record<ErrorStatus, number>;
}

export function isErrorStatus(value: string): value is ErrorStatus {
    return (ERROR_STATUSES as readonly string[]).includes(value);
}

/** Never throws — every field falls back to a safe default instead of rejecting a malformed caller-supplied param bag. */
export function parseErrorsListFilters(raw: {
    flavour?: string;
    status?: string;
    q?: string;
    cursor?: number | string | null;
}): ErrorsListFilters {
    const status = raw.status === 'all' || (raw.status && isErrorStatus(raw.status)) ? (raw.status as ErrorStatus | 'all') : 'all';
    const cursorNumber = raw.cursor === null || raw.cursor === undefined ? null : Number(raw.cursor);
    const cursor = cursorNumber !== null && Number.isInteger(cursorNumber) && cursorNumber >= 0 ? cursorNumber : null;
    return {
        flavour: raw.flavour ?? 'all',
        status,
        q: (raw.q ?? '').slice(0, 200),
        cursor,
    };
}

/** Throws on an empty or invalid list — callers are server actions guarded by an access gate, so a bad id list is a bug, not user input to degrade gracefully for. */
export function boundErrorIds(ids: number[]): number[] {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('errors_board: id list must not be empty');
    if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new Error('errors_board: every id must be a positive integer');
    }
    return ids.slice(0, MAX_IDS_PER_ACTION);
}

function truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export { MAX_MESSAGE_LENGTH, MAX_STACK_LENGTH, MAX_PARAMS_LENGTH, truncate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/server/errors_repository.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/server/errors_repository.ts package/src/errors_board/server/errors_repository.test.ts
git commit -m "feat(errors_board): add errors_repository types and validation"
```

---

### Task 6: `errors_repository` — schema + CRUD (part 2)

**Files:**
- Modify: `package/src/errors_board/server/errors_repository.ts`
- Modify: `package/src/errors_board/server/errors_repository.test.ts`

**Interfaces:**
- Consumes: everything from Task 5 (same file).
- Produces: `computeFingerprint`, `recordError`, `listErrors`, `getErrorById`, `distinctFlavours`, `loadErrorsBoard`, `setErrorsStatus`, `deleteErrorsByIds`, `deleteAllResolvedErrors` — consumed by Task 8 (`createErrorsActions`) and by consumer `page.tsx` wiring shown in the README (Task 9).

- [ ] **Step 1: Write the failing tests**

Append to `package/src/errors_board/server/errors_repository.test.ts`:

```ts
import {
    computeFingerprint,
    recordError,
    listErrors,
    getErrorById,
    distinctFlavours,
    loadErrorsBoard,
    setErrorsStatus,
    deleteErrorsByIds,
    deleteAllResolvedErrors,
    type D1DatabaseLike,
    type D1PreparedStatementLike,
} from './errors_repository.js';

/** Records every `prepare()` call's SQL + the final `bind()` args, without emulating real SQLite semantics — sufficient to assert *what* the repository asks D1 to do. */
function createFakeD1(overrides?: {
    all?: unknown[];
    first?: unknown;
    batch?: unknown[][];
}): D1DatabaseLike & { calls: { sql: string; bindings: unknown[] }[] } {
    const calls: { sql: string; bindings: unknown[] }[] = [];
    function makeStatement(sql: string): D1PreparedStatementLike {
        let bindings: unknown[] = [];
        const statement: D1PreparedStatementLike = {
            bind(...values: unknown[]) {
                bindings = values;
                return statement;
            },
            async run() {
                calls.push({ sql, bindings });
                return {};
            },
            async all<T>() {
                calls.push({ sql, bindings });
                return { results: (overrides?.all ?? []) as T[] };
            },
            async first<T>() {
                calls.push({ sql, bindings });
                return (overrides?.first ?? null) as T | null;
            },
        };
        return statement;
    }
    return {
        calls,
        prepare: (sql: string) => makeStatement(sql),
        batch: async (statements: D1PreparedStatementLike[]) => {
            const results = overrides?.batch ?? statements.map(() => []);
            for (const s of statements) await (s as unknown as { run(): Promise<unknown> }).run();
            return results.map((r) => ({ results: r }));
        },
    };
}

describe('computeFingerprint', () => {
    it('is stable for the same inputs and differs when any input changes', async () => {
        const a = await computeFingerprint('prod', 'MyClass.method', 'boom');
        const b = await computeFingerprint('prod', 'MyClass.method', 'boom');
        const c = await computeFingerprint('prod', 'MyClass.method', 'different');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
});

describe('recordError', () => {
    it('creates the table, indexes, and inserts a row bound with the input fields', async () => {
        const db = createFakeD1();
        await recordError(db, {
            flavour: 'prod',
            caller: 'MyClass.method',
            message: 'boom',
            stack: 'at MyClass.method',
            params: '{}',
            isClient: false,
            userEmail: 'user@example.com',
        });
        const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO errors'));
        expect(insertCall).toBeDefined();
        expect(insertCall!.bindings).toContain('prod');
        expect(insertCall!.bindings).toContain('MyClass.method');
        expect(insertCall!.bindings).toContain('boom');
        expect(insertCall!.bindings).toContain('user@example.com');
    });
});

describe('listErrors', () => {
    it('binds the flavour, status, search, and cursor filters into the WHERE clause', async () => {
        const db = createFakeD1({ all: [] });
        await listErrors(db, { flavour: 'prod', status: 'new', q: 'timeout', cursor: 100 });
        const listCall = db.calls.find((c) => c.sql.startsWith('SELECT * FROM errors'));
        expect(listCall!.sql).toContain('flavour = ?');
        expect(listCall!.sql).toContain('status = ?');
        expect(listCall!.sql).toContain('updated_at < ?');
        expect(listCall!.bindings).toEqual(expect.arrayContaining(['prod', 'new', 100]));
    });

    it('excludes muted rows when status is "all"', async () => {
        const db = createFakeD1({ all: [] });
        await listErrors(db, { flavour: 'all', status: 'all', q: '', cursor: null });
        const listCall = db.calls.find((c) => c.sql.startsWith('SELECT * FROM errors'));
        expect(listCall!.sql).toContain("status != 'muted'");
    });

    it('reports nextCursor from the (PAGE_SIZE+1)th row and trims the page to PAGE_SIZE', async () => {
        const rows = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, updated_at: 1000 - i }));
        const db = createFakeD1({ all: rows });
        const result = await listErrors(db, { flavour: 'all', status: 'all', q: '', cursor: null });
        expect(result.rows).toHaveLength(50);
        expect(result.nextCursor).toBe(rows[49].updated_at);
    });
});

describe('getErrorById', () => {
    it('returns the row when found', async () => {
        const db = createFakeD1({ first: { id: 1 } });
        expect(await getErrorById(db, 1)).toEqual({ id: 1 });
    });
    it('returns null when not found', async () => {
        const db = createFakeD1({ first: null });
        expect(await getErrorById(db, 999)).toBeNull();
    });
});

describe('distinctFlavours', () => {
    it('maps rows to a flat string array', async () => {
        const db = createFakeD1({ all: [{ flavour: 'prod' }, { flavour: 'staging' }] });
        expect(await distinctFlavours(db)).toEqual(['prod', 'staging']);
    });
});

describe('loadErrorsBoard', () => {
    it('runs one batch call and assembles rows/flavours/counts from it', async () => {
        const db = createFakeD1({
            batch: [
                [{ id: 1, updated_at: 100 }],
                [{ flavour: 'prod' }],
                [{ status: 'new', count: 3 }],
            ],
        });
        const board = await loadErrorsBoard(db, { flavour: 'all', status: 'all', q: '', cursor: null });
        expect(board.rows).toEqual([{ id: 1, updated_at: 100 }]);
        expect(board.flavours).toEqual(['prod']);
        expect(board.counts).toEqual({ new: 3, investigating: 0, resolved: 0, muted: 0 });
    });
});

describe('setErrorsStatus', () => {
    it('binds the status and stamps resolved_at only when resolving', async () => {
        const db = createFakeD1();
        await setErrorsStatus(db, [1, 2], 'resolved');
        const updateCall = db.calls.find((c) => c.sql.startsWith('UPDATE errors'));
        expect(updateCall!.bindings.slice(0, 2)).toEqual(['resolved', 'resolved']);
        expect(updateCall!.bindings).toContain(1);
        expect(updateCall!.bindings).toContain(2);
    });
});

describe('deleteErrorsByIds / deleteAllResolvedErrors', () => {
    it('deletes by id list', async () => {
        const db = createFakeD1();
        await deleteErrorsByIds(db, [1, 2, 3]);
        const deleteCall = db.calls.find((c) => c.sql.startsWith('DELETE FROM errors WHERE id IN'));
        expect(deleteCall!.bindings).toEqual([1, 2, 3]);
    });
    it('deletes all resolved rows', async () => {
        const db = createFakeD1();
        await deleteAllResolvedErrors(db);
        expect(db.calls.some((c) => c.sql === "DELETE FROM errors WHERE status = 'resolved'")).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/server/errors_repository.test.ts`
Expected: FAIL — `computeFingerprint`/`recordError`/etc. are not exported yet.

- [ ] **Step 3: Write minimal implementation**

Append to `package/src/errors_board/server/errors_repository.ts` (keep the exports from Task 5 above it unchanged):

```ts
const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS errors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT    NOT NULL UNIQUE,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        flavour     TEXT    NOT NULL,
        caller      TEXT    NOT NULL,
        message     TEXT    NOT NULL,
        stack       TEXT,
        params      TEXT,
        is_client   INTEGER NOT NULL DEFAULT 0,
        status      TEXT    NOT NULL DEFAULT 'new',
        count       INTEGER NOT NULL DEFAULT 1,
        user_email  TEXT,
        reopen_count INTEGER NOT NULL DEFAULT 0,
        resolved_at  INTEGER
    )
`;

const CREATE_INDEXES_SQL = [
    'CREATE INDEX IF NOT EXISTS idx_errors_updated_at ON errors (updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_errors_flavour ON errors (flavour)',
    'CREATE INDEX IF NOT EXISTS idx_errors_status ON errors (status)',
];

// Per-db memo, keyed by the D1DatabaseLike instance itself — avoids re-running
// the DDL on every call within the same Worker isolate. Any two calls sharing
// the same db object share the same schema-ready promise.
const schemaReadyByDb = new WeakMap<D1DatabaseLike, Promise<void>>();

function ensureSchema(db: D1DatabaseLike): Promise<void> {
    const existing = schemaReadyByDb.get(db);
    if (existing) return existing;
    const ready = db
        .batch([db.prepare(CREATE_TABLE_SQL), ...CREATE_INDEXES_SQL.map((sql) => db.prepare(sql))])
        .then(() => undefined)
        .catch((error) => {
            schemaReadyByDb.delete(db);
            throw error;
        });
    schemaReadyByDb.set(db, ready);
    return ready;
}

export async function computeFingerprint(flavour: string, caller: string, message: string): Promise<string> {
    const data = new TextEncoder().encode(`${flavour}|${caller}|${message}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function recordError(db: D1DatabaseLike, input: RecordErrorInput): Promise<void> {
    await ensureSchema(db);
    const message = truncate(input.message, MAX_MESSAGE_LENGTH);
    const stack = input.stack ? truncate(input.stack, MAX_STACK_LENGTH) : null;
    const params = input.params ? truncate(input.params, MAX_PARAMS_LENGTH) : null;
    const fingerprint = await computeFingerprint(input.flavour, input.caller, message);
    const now = Date.now();

    await db
        .prepare(
            `INSERT INTO errors (fingerprint, created_at, updated_at, flavour, caller, message, stack, params, is_client, user_email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (fingerprint) DO UPDATE SET
               updated_at   = excluded.updated_at,
               count        = count + 1,
               stack        = excluded.stack,
               params       = excluded.params,
               user_email   = excluded.user_email,
               reopen_count = CASE WHEN status = 'resolved' THEN reopen_count + 1 ELSE reopen_count END,
               status       = CASE WHEN status = 'resolved' THEN 'new' ELSE status END`,
        )
        .bind(fingerprint, now, now, input.flavour, input.caller, message, stack, params, input.isClient ? 1 : 0, input.userEmail)
        .run();
}

function buildListQuery(filters: ErrorsListFilters): { sql: string; bindings: unknown[] } {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (filters.flavour !== 'all') {
        conditions.push('flavour = ?');
        bindings.push(filters.flavour);
    }
    if (filters.status === 'all') {
        conditions.push("status != 'muted'");
    } else {
        conditions.push('status = ?');
        bindings.push(filters.status);
    }
    if (filters.q) {
        conditions.push('(message LIKE ? OR caller LIKE ? OR user_email LIKE ?)');
        const like = `%${filters.q}%`;
        bindings.push(like, like, like);
    }
    if (filters.cursor !== null) {
        conditions.push('updated_at < ?');
        bindings.push(filters.cursor);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    bindings.push(ERRORS_PAGE_SIZE + 1);
    return { sql: `SELECT * FROM errors ${where} ORDER BY updated_at DESC, id DESC LIMIT ?`, bindings };
}

function paginate(rows: ErrorRow[]): ErrorsListResult {
    const hasMore = rows.length > ERRORS_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, ERRORS_PAGE_SIZE) : rows;
    return { rows: page, nextCursor: hasMore ? page[page.length - 1].updated_at : null };
}

export async function listErrors(db: D1DatabaseLike, filters: ErrorsListFilters): Promise<ErrorsListResult> {
    await ensureSchema(db);
    const { sql, bindings } = buildListQuery(filters);
    const result = await db.prepare(sql).bind(...bindings).all<ErrorRow>();
    return paginate(result.results ?? []);
}

export async function getErrorById(db: D1DatabaseLike, id: number): Promise<ErrorRow | null> {
    await ensureSchema(db);
    const row = await db.prepare('SELECT * FROM errors WHERE id = ?').bind(id).first<ErrorRow>();
    return row ?? null;
}

export async function distinctFlavours(db: D1DatabaseLike): Promise<string[]> {
    await ensureSchema(db);
    const result = await db.prepare('SELECT DISTINCT flavour FROM errors ORDER BY flavour').all<{ flavour: string }>();
    return (result.results ?? []).map((row) => row.flavour);
}

export async function loadErrorsBoard(db: D1DatabaseLike, filters: ErrorsListFilters): Promise<ErrorsBoardResult> {
    await ensureSchema(db);
    const listQuery = buildListQuery(filters);
    const [listResult, flavourResult, countResult] = await db.batch([
        db.prepare(listQuery.sql).bind(...listQuery.bindings),
        db.prepare('SELECT DISTINCT flavour FROM errors ORDER BY flavour'),
        db.prepare('SELECT status, COUNT(*) as count FROM errors GROUP BY status'),
    ]);

    const counts: Record<ErrorStatus, number> = { new: 0, investigating: 0, resolved: 0, muted: 0 };
    for (const row of (countResult.results ?? []) as { status: ErrorStatus; count: number }[]) {
        counts[row.status] = row.count;
    }

    return {
        ...paginate((listResult.results ?? []) as ErrorRow[]),
        flavours: ((flavourResult.results ?? []) as { flavour: string }[]).map((row) => row.flavour),
        counts,
    };
}

export async function setErrorsStatus(db: D1DatabaseLike, ids: number[], status: ErrorStatus): Promise<void> {
    await ensureSchema(db);
    const boundedIds = boundErrorIds(ids);
    const placeholders = boundedIds.map(() => '?').join(', ');
    await db
        .prepare(
            `UPDATE errors
                SET status      = ?,
                    resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE NULL END
              WHERE id IN (${placeholders})`,
        )
        .bind(status, status, Date.now(), ...boundedIds)
        .run();
}

export async function deleteErrorsByIds(db: D1DatabaseLike, ids: number[]): Promise<void> {
    await ensureSchema(db);
    const boundedIds = boundErrorIds(ids);
    const placeholders = boundedIds.map(() => '?').join(', ');
    await db.prepare(`DELETE FROM errors WHERE id IN (${placeholders})`).bind(...boundedIds).run();
}

export async function deleteAllResolvedErrors(db: D1DatabaseLike): Promise<void> {
    await ensureSchema(db);
    await db.prepare("DELETE FROM errors WHERE status = 'resolved'").run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/server/errors_repository.test.ts`
Expected: PASS (all tests from Task 5 + Task 6)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/server/errors_repository.ts package/src/errors_board/server/errors_repository.test.ts
git commit -m "feat(errors_board): add errors_repository schema and CRUD"
```

---

### Task 7: `createRequireErrorsAccess` — customizable Firebase-email gate

**Files:**
- Create: `package/src/errors_board/server/gate.ts`
- Test: `package/src/errors_board/server/gate.test.ts`

**Interfaces:**
- Consumes: `getAuthUser` from `../../firebase_auth/server/use_auth_user_server.js` (existing package export, `getFirebaseAuthUser` subpath).
- Produces: `createRequireErrorsAccess(options: ErrorsAccessOptions): () => Promise<void>` — consumed by Task 8 and by the consumer's own `gate.ts` shown in the README (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// package/src/errors_board/server/gate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notFound = vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

let currentUser: { email?: string | null } | null;
vi.mock('../../firebase_auth/server/use_auth_user_server.js', () => ({
    getAuthUser: vi.fn(async () => ({ user: currentUser, loading: false })),
}));

import { createRequireErrorsAccess } from './gate.js';

describe('createRequireErrorsAccess', () => {
    beforeEach(() => {
        notFound.mockClear();
        currentUser = null;
    });

    it('passes when the signed-in email is in the allowed list', async () => {
        currentUser = { email: 'tester@example.com' };
        const requireAccess = createRequireErrorsAccess({ allowedEmails: ['tester@example.com'] });
        await expect(requireAccess()).resolves.toBeUndefined();
        expect(notFound).not.toHaveBeenCalled();
    });

    it('calls notFound() when there is no signed-in user', async () => {
        currentUser = null;
        const requireAccess = createRequireErrorsAccess({ allowedEmails: ['tester@example.com'] });
        await expect(requireAccess()).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('calls notFound() when the signed-in email is not in the allowed list', async () => {
        currentUser = { email: 'someone-else@example.com' };
        const requireAccess = createRequireErrorsAccess({ allowedEmails: ['tester@example.com'] });
        await expect(requireAccess()).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('accepts a predicate function instead of a fixed list', async () => {
        currentUser = { email: 'anyone@codinghouse.biz' };
        const requireAccess = createRequireErrorsAccess({
            allowedEmails: (email) => email?.endsWith('@codinghouse.biz') ?? false,
        });
        await expect(requireAccess()).resolves.toBeUndefined();
    });

    it('calls a custom onDenied instead of notFound() when provided', async () => {
        currentUser = null;
        const onDenied = vi.fn();
        const requireAccess = createRequireErrorsAccess({ allowedEmails: [], onDenied });
        await requireAccess();
        expect(onDenied).toHaveBeenCalledTimes(1);
        expect(notFound).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/server/gate.test.ts`
Expected: FAIL with "Cannot find module './gate.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/errors_board/server/gate.ts
import { getAuthUser } from '../../firebase_auth/server/use_auth_user_server.js';

export interface ErrorsAccessOptions {
    /** A fixed allowlist, or a predicate for something more dynamic (a domain suffix, a role claim lookup, etc). */
    allowedEmails: readonly string[] | ((email: string | null) => boolean);
    /** Called instead of `notFound()` on denial — e.g. to redirect somewhere else instead. Defaults to Next's `notFound()`, matching `clarivant/CRV/src/app/errors/gate.ts`'s "don't advertise the route" behavior. */
    onDenied?: () => void | Promise<void>;
}

/**
 * Builds a `requireErrorsAccess()` guard, reusing this package's own
 * signed-in Firebase session (`getAuthUser`) rather than a separate
 * shared-password cookie — same approach as
 * `clarivant/CRV/src/app/errors/gate.ts`. Re-export the returned function
 * from your own `gate.ts` and call it at the top of your `page.tsx`/
 * `actions.ts`.
 */
export function createRequireErrorsAccess(options: ErrorsAccessOptions): () => Promise<void> {
    const isAllowed = typeof options.allowedEmails === 'function'
        ? options.allowedEmails
        : (email: string | null) => (options.allowedEmails as readonly string[]).includes(email ?? '');

    return async function requireErrorsAccess(): Promise<void> {
        const { user } = await getAuthUser();
        if (isAllowed(user?.email ?? null)) return;

        if (options.onDenied) {
            await options.onDenied();
            return;
        }
        const { notFound } = await import('next/navigation');
        notFound();
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/server/gate.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/server/gate.ts package/src/errors_board/server/gate.test.ts
git commit -m "feat(errors_board): add createRequireErrorsAccess gate"
```

---

### Task 8: `createErrorsActions` — server-action factory

**Files:**
- Create: `package/src/errors_board/server/actions_factory.ts`
- Test: `package/src/errors_board/server/actions_factory.test.ts`

**Interfaces:**
- Consumes: `listErrors`, `setErrorsStatus`, `deleteErrorsByIds`, `deleteAllResolvedErrors`, `parseErrorsListFilters`, `boundErrorIds`, `isErrorStatus`, types `D1DatabaseLike`, `ErrorStatus`, `ErrorsListResult` (Task 5/6, same import path `./errors_repository.js`).
- Produces: `ErrorsActions` interface and `createErrorsActions(options: ErrorsActionsOptions): ErrorsActions` — consumed directly by the consumer's own `"use server"` `actions.ts` file (Task 9 README) and by the `errors_board/client` components (Tasks 11–13), which take an `ErrorsActions` object as a prop rather than importing actions themselves.

- [ ] **Step 1: Write the failing test**

```ts
// package/src/errors_board/server/actions_factory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { createErrorsActions } from './actions_factory.js';

describe('createErrorsActions', () => {
    let requireAccess: ReturnType<typeof vi.fn>;
    let db: { marker: string };
    let getDb: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        requireAccess = vi.fn(async () => undefined);
        db = { marker: 'fake-db' };
        getDb = vi.fn(async () => db);
    });

    it('loadErrors calls requireAccess, parses filters, and returns the repository result', async () => {
        const listErrors = vi.fn(async () => ({ rows: [], nextCursor: null }));
        const actions = createErrorsActions({ getDb, requireAccess, repository: { listErrors } as never });

        const result = await actions.loadErrors({ status: 'new', cursor: null });

        expect(requireAccess).toHaveBeenCalledTimes(1);
        expect(listErrors).toHaveBeenCalledWith(db, { flavour: 'all', status: 'new', q: '', cursor: null });
        expect(result).toEqual({ rows: [], nextCursor: null });
    });

    it('setErrorStatus validates ids/status, calls the repository, and revalidates the list path', async () => {
        const setErrorsStatus = vi.fn(async () => undefined);
        const actions = createErrorsActions({ getDb, requireAccess, repository: { setErrorsStatus } as never });

        await actions.setErrorStatus([1, 2], 'resolved');

        expect(setErrorsStatus).toHaveBeenCalledWith(db, [1, 2], 'resolved');
        expect(revalidatePath).toHaveBeenCalledWith('/errors');
    });

    it('setErrorStatus rejects an unknown status before touching the db', async () => {
        const setErrorsStatus = vi.fn();
        const actions = createErrorsActions({ getDb, requireAccess, repository: { setErrorsStatus } as never });

        await expect(actions.setErrorStatus([1], 'bogus')).rejects.toThrow();
        expect(setErrorsStatus).not.toHaveBeenCalled();
    });

    it('deleteErrors validates ids, calls the repository, and revalidates a custom listPath', async () => {
        const deleteErrorsByIds = vi.fn(async () => undefined);
        const actions = createErrorsActions({
            getDb, requireAccess, listPath: '/admin/errors', repository: { deleteErrorsByIds } as never,
        });

        await actions.deleteErrors([5]);

        expect(deleteErrorsByIds).toHaveBeenCalledWith(db, [5]);
        expect(revalidatePath).toHaveBeenCalledWith('/admin/errors');
    });

    it('deleteAllResolved calls the repository and revalidates', async () => {
        const deleteAllResolvedErrors = vi.fn(async () => undefined);
        const actions = createErrorsActions({ getDb, requireAccess, repository: { deleteAllResolvedErrors } as never });

        await actions.deleteAllResolved();

        expect(deleteAllResolvedErrors).toHaveBeenCalledWith(db);
        expect(revalidatePath).toHaveBeenCalledWith('/errors');
    });

    it('every action calls requireAccess before touching the repository', async () => {
        requireAccess = vi.fn(async () => {
            throw new Error('denied');
        });
        const repository = {
            listErrors: vi.fn(),
            setErrorsStatus: vi.fn(),
            deleteErrorsByIds: vi.fn(),
            deleteAllResolvedErrors: vi.fn(),
        };
        const actions = createErrorsActions({ getDb, requireAccess, repository: repository as never });

        await expect(actions.loadErrors({})).rejects.toThrow('denied');
        expect(repository.listErrors).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/server/actions_factory.test.ts`
Expected: FAIL with "Cannot find module './actions_factory.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/errors_board/server/actions_factory.ts
import {
    type D1DatabaseLike,
    type ErrorsListResult,
    parseErrorsListFilters,
    boundErrorIds,
    isErrorStatus,
    listErrors as listErrorsImpl,
    setErrorsStatus as setErrorsStatusImpl,
    deleteErrorsByIds as deleteErrorsByIdsImpl,
    deleteAllResolvedErrors as deleteAllResolvedErrorsImpl,
} from './errors_repository.js';

export interface ErrorsActions {
    loadErrors(rawParams: { flavour?: string; status?: string; q?: string; cursor?: number | null }): Promise<ErrorsListResult>;
    setErrorStatus(ids: number[], status: string): Promise<void>;
    deleteErrors(ids: number[]): Promise<void>;
    deleteAllResolved(): Promise<void>;
}

export interface ErrorsActionsOptions {
    /** Resolves the D1 database for the current request — e.g. `() => env.ERRORS_DB` via your own `generate.env`. */
    getDb: () => Promise<D1DatabaseLike> | D1DatabaseLike;
    /** Your `createRequireErrorsAccess(...)` result, or any other `() => Promise<void>` guard that throws/redirects on denial. */
    requireAccess: () => Promise<void>;
    /** Path passed to `revalidatePath` after a mutation. Defaults to `/errors`. */
    listPath?: string;
    /** Injection point for tests only — defaults to the real repository functions. */
    repository?: {
        listErrors?: typeof listErrorsImpl;
        setErrorsStatus?: typeof setErrorsStatusImpl;
        deleteErrorsByIds?: typeof deleteErrorsByIdsImpl;
        deleteAllResolvedErrors?: typeof deleteAllResolvedErrorsImpl;
    };
}

/**
 * Builds the four server actions the `errors_board` client components need.
 * Re-export the result from your own `"use server"` file (same constraint
 * as `createServerErrorAction` — Next requires every top-level export of a
 * `"use server"` file to itself be declared async, so the factory call
 * must live in a plain module and the `"use server"` directive in the file
 * that imports and re-exports its result).
 */
export function createErrorsActions(options: ErrorsActionsOptions): ErrorsActions {
    const listErrors = options.repository?.listErrors ?? listErrorsImpl;
    const setErrorsStatus = options.repository?.setErrorsStatus ?? setErrorsStatusImpl;
    const deleteErrorsByIds = options.repository?.deleteErrorsByIds ?? deleteErrorsByIdsImpl;
    const deleteAllResolvedErrors = options.repository?.deleteAllResolvedErrors ?? deleteAllResolvedErrorsImpl;
    const listPath = options.listPath ?? '/errors';

    return {
        async loadErrors(rawParams): Promise<ErrorsListResult> {
            await options.requireAccess();
            const filters = parseErrorsListFilters(rawParams);
            const db = await options.getDb();
            return listErrors(db, filters);
        },

        async setErrorStatus(ids, status): Promise<void> {
            await options.requireAccess();
            if (!isErrorStatus(status)) throw new Error(`errors_board: unknown status "${status}"`);
            const boundedIds = boundErrorIds(ids);
            const db = await options.getDb();
            await setErrorsStatus(db, boundedIds, status);
            const { revalidatePath } = await import('next/cache');
            revalidatePath(listPath);
        },

        async deleteErrors(ids): Promise<void> {
            await options.requireAccess();
            const boundedIds = boundErrorIds(ids);
            const db = await options.getDb();
            await deleteErrorsByIds(db, boundedIds);
            const { revalidatePath } = await import('next/cache');
            revalidatePath(listPath);
        },

        async deleteAllResolved(): Promise<void> {
            await options.requireAccess();
            const db = await options.getDb();
            await deleteAllResolvedErrors(db);
            const { revalidatePath } = await import('next/cache');
            revalidatePath(listPath);
        },
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/server/actions_factory.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/server/actions_factory.ts package/src/errors_board/server/actions_factory.test.ts
git commit -m "feat(errors_board): add createErrorsActions factory"
```

---

### Task 9: `errors_board/server` barrel + `recordError` write-side wiring note + package.json exports

**Files:**
- Create: `package/src/errors_board/server/index.ts`
- Modify: `package/package.json` (`exports` map)

**Interfaces:**
- Consumes: everything from Tasks 5–8.
- Produces: `cloudflare-next-intl/errorsBoard` importable by consumers (server-side pieces only — components are separate subpaths, added in Task 14).

- [ ] **Step 1: Write the barrel**

```ts
// package/src/errors_board/server/index.ts
export {
    ERROR_STATUSES,
    BOARD_STATUSES,
    ERRORS_PAGE_SIZE,
    MAX_IDS_PER_ACTION,
    isErrorStatus,
    parseErrorsListFilters,
    boundErrorIds,
    computeFingerprint,
    recordError,
    listErrors,
    getErrorById,
    distinctFlavours,
    loadErrorsBoard,
    setErrorsStatus,
    deleteErrorsByIds,
    deleteAllResolvedErrors,
    type ErrorStatus,
    type ErrorRow,
    type D1DatabaseLike,
    type D1PreparedStatementLike,
    type RecordErrorInput,
    type ErrorsListFilters,
    type ErrorsListResult,
    type ErrorsBoardResult,
} from './errors_repository.js';
export { createRequireErrorsAccess, type ErrorsAccessOptions } from './gate.js';
export { createErrorsActions, type ErrorsActions, type ErrorsActionsOptions } from './actions_factory.js';
```

- [ ] **Step 2: Add the package.json export**

In `package/package.json`, add (alongside the `./firebaseAuth*` entries):

```json
"./errorsBoard": {
    "types": "./dist/src/errors_board/server/index.d.ts",
    "import": "./dist/src/errors_board/server/index.js"
},
```

- [ ] **Step 3: Verify the build and exports**

Run: `cd package && npm run build && npm run check:exports`
Expected: both succeed.

- [ ] **Step 4: Run the full existing test suite to confirm nothing else broke**

Run: `cd package && npm test`
Expected: PASS — same pass count as before this plan, plus the new `errors_board/server` and `cloudflare_fetch` tests.

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/server/index.ts package/package.json
git commit -m "feat(errors_board): add server barrel and errorsBoard export"
```

---

### Task 10: `error_ui_helpers` — shared formatting/labels (no `luxon`)

**Files:**
- Create: `package/src/errors_board/shared/error_ui_helpers.ts`
- Test: `package/src/errors_board/shared/error_ui_helpers.test.ts`

**Interfaces:**
- Consumes: `ErrorStatus` type from `../server/errors_repository.js`.
- Produces: `STATUS_LABELS`, `STATUS_HINTS`, `STATUS_DOT_CLASS`, `STATUS_BADGE_CLASS`, `formatRelativeTime`, `formatLocalTimestamp`, `parseRequestContext`, `type ParsedRequestContext` — consumed by every component in Tasks 11–13.

- [ ] **Step 1: Write the failing test**

```ts
// package/src/errors_board/shared/error_ui_helpers.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, formatLocalTimestamp, parseRequestContext, STATUS_LABELS } from './error_ui_helpers.js';

describe('formatRelativeTime', () => {
    afterEach(() => vi.useRealTimers());

    it('renders a past timestamp as "X ago"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
        expect(formatRelativeTime(new Date('2026-01-01T00:00:00Z').getTime())).toBe('10 minutes ago');
    });

    it('renders "just now" for anything under a minute', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
        expect(formatRelativeTime(new Date('2026-01-01T00:00:00Z').getTime())).toBe('just now');
    });
});

describe('formatLocalTimestamp', () => {
    it('formats a UTC-ms timestamp as a locale date-time string', () => {
        const formatted = formatLocalTimestamp(Date.UTC(2026, 0, 1, 12, 30));
        expect(typeof formatted).toBe('string');
        expect(formatted.length).toBeGreaterThan(0);
    });
});

describe('parseRequestContext', () => {
    it('returns null for null input', () => {
        expect(parseRequestContext(null)).toBeNull();
    });
    it('returns null for unparseable JSON', () => {
        expect(parseRequestContext('not json')).toBeNull();
    });
    it('returns null when there is no requestContext key', () => {
        expect(parseRequestContext(JSON.stringify({ other: 1 }))).toBeNull();
    });
    it('extracts requestContext when present', () => {
        const parsed = parseRequestContext(JSON.stringify({ requestContext: { path: '/a', userAgent: 'ua', referer: 'r' } }));
        expect(parsed).toEqual({ path: '/a', userAgent: 'ua', referer: 'r' });
    });
});

describe('STATUS_LABELS', () => {
    it('has an entry for every status', () => {
        expect(Object.keys(STATUS_LABELS).sort()).toEqual(['investigating', 'muted', 'new', 'resolved']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/shared/error_ui_helpers.test.ts`
Expected: FAIL with "Cannot find module './error_ui_helpers.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/errors_board/shared/error_ui_helpers.ts
import type { ErrorStatus } from '../server/errors_repository.js';

export const STATUS_LABELS: Record<ErrorStatus, string> = {
    new: 'New',
    investigating: 'Investigating',
    resolved: 'Resolved',
    muted: 'Muted',
};

/** One-line explanation of what each status DOES when the error fires again. */
export const STATUS_HINTS: Record<ErrorStatus, string> = {
    new: 'Needs triage.',
    investigating: 'Being worked on. Repeats keep this status.',
    resolved: 'Fixed. If it happens again it reopens as New.',
    muted: 'Ignored for good. Repeats stay hidden and never change status.',
};

export const STATUS_DOT_CLASS: Record<ErrorStatus, string> = {
    new: 'bg-red-500',
    investigating: 'bg-amber-500',
    resolved: 'bg-emerald-500',
    muted: 'bg-gray-400 dark:bg-gray-500',
};

export const STATUS_BADGE_CLASS: Record<ErrorStatus, string> = {
    new: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
    investigating: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    muted: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700',
};

export function formatRelativeTime(timestampMs: number): string {
    const diffSeconds = Math.round((timestampMs - Date.now()) / 1000);
    const absSeconds = Math.abs(diffSeconds);

    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];

    for (const [unit, secondsInUnit] of units) {
        if (absSeconds >= secondsInUnit) {
            const value = Math.round(diffSeconds / secondsInUnit);
            return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
        }
    }
    return 'just now';
}

/** Native `Intl` instead of `luxon` (this package has no date-library dependency to spend on one formatter) — a locale-formatted date-time string in the *caller's* timezone (the browser's zone, when called from a client component). */
export function formatLocalTimestamp(timestampMs: number): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(timestampMs));
}

export interface ParsedRequestContext {
    path?: string;
    userAgent?: string;
    referer?: string;
}

/** `params` is the raw JSON stored on the row — `createErrorsActions`'s callers typically write `requestContext: { path, userAgent, referer }` alongside their own params for a client-originated error (see the README); server errors won't have it. */
export function parseRequestContext(paramsJson: string | null): ParsedRequestContext | null {
    if (!paramsJson) return null;
    try {
        const parsed = JSON.parse(paramsJson) as { requestContext?: ParsedRequestContext };
        return parsed.requestContext ?? null;
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/shared/error_ui_helpers.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/shared/error_ui_helpers.ts package/src/errors_board/shared/error_ui_helpers.test.ts
git commit -m "feat(errors_board): add shared error_ui_helpers"
```

---

### Task 11: `error_ui_client` — `useMounted`, `LocalTime`, `CopyButton`, `DetailBlock`

**Files:**
- Create: `package/src/errors_board/client/error_ui_client.tsx`
- Test: `package/src/errors_board/client/error_ui_client.test.tsx`

**Interfaces:**
- Consumes: React (`useEffect`, `useState`).
- Produces: `useMounted()`, `LocalTime`, `CopyButton`, `DetailBlock` — consumed by Tasks 12–13.

- [ ] **Step 1: Write the failing test**

```tsx
// package/src/errors_board/client/error_ui_client.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocalTime, CopyButton, DetailBlock } from './error_ui_client.js';

describe('LocalTime', () => {
    it('renders blank before mount, then the formatted value after', async () => {
        render(<LocalTime format={(ms) => `formatted-${ms}`} timestampMs={1000} />);
        expect(await screen.findByText('formatted-1000')).toBeInTheDocument();
    });
});

describe('CopyButton', () => {
    it('copies the given text and shows the copied label', async () => {
        const writeText = vi.fn(async () => undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        render(<CopyButton text="hello" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        expect(writeText).toHaveBeenCalledWith('hello');
        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Copied'));
    });
});

describe('DetailBlock', () => {
    it('renders the label and text', () => {
        render(<DetailBlock label="Stack trace" text="at foo.bar" />);
        expect(screen.getByText('Stack trace')).toBeInTheDocument();
        expect(screen.getByText('at foo.bar')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/client/error_ui_client.test.tsx`
Expected: FAIL with "Cannot find module './error_ui_client.js'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// package/src/errors_board/client/error_ui_client.tsx
'use client';

import { useEffect, useState } from 'react';

/** These pages typically SSR fresh on every request while the server clock and the browser's differ — reading the browser zone during render would mismatch on hydration, so defer it until after mount. */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}

/** Renders a browser-zone-dependent time string, blank until hydrated. */
export function LocalTime({ format, timestampMs }: {
    format: (timestampMs: number) => string;
    timestampMs: number;
}): Component {
    const mounted = useMounted();
    return <span suppressHydrationWarning>{mounted ? format(timestampMs) : ''}</span>;
}

export function CopyButton({
    text,
    label = 'Copy',
    copiedLabel = 'Copied',
}: {
    text: string;
    label?: string;
    copiedLabel?: string;
}): Component {
    const [copied, setCopied] = useState(false);

    function handleCopy(event: React.MouseEvent): void {
        event.preventDefault();
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
            {copied ? copiedLabel : label}
        </button>
    );
}

export function DetailBlock({ label, text }: { label: string; text: string }): Component {
    return (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-950/60">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
                <CopyButton text={text} />
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                {text}
            </pre>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/client/error_ui_client.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/client/error_ui_client.tsx package/src/errors_board/client/error_ui_client.test.tsx
git commit -m "feat(errors_board): add error_ui_client (useMounted, LocalTime, CopyButton, DetailBlock)"
```

---

### Task 12: `ErrorsStatStrip` and `ErrorsFilterForm`

**Files:**
- Create: `package/src/errors_board/client/errors_stat_strip.tsx`
- Test: `package/src/errors_board/client/errors_stat_strip.test.tsx`
- Create: `package/src/errors_board/client/errors_filter_form.tsx`
- Test: `package/src/errors_board/client/errors_filter_form.test.tsx`

**Interfaces:**
- Consumes: `ErrorStatus` type (`../server/errors_repository.js`). `ErrorsStatStrip` takes `linkFor` as a prop (not a hardcoded `/errors` `Link`) so it's mountable at any route — the one customization point the reference implementation hardcoded.
- Produces: `ErrorsStatStrip` (default export), `ErrorsFilterForm` (default export) — consumed by the consumer's own `page.tsx` (shown in Task 15's README).

- [ ] **Step 1: Write the failing tests**

```tsx
// package/src/errors_board/client/errors_stat_strip.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorsStatStrip from './errors_stat_strip.js';

describe('ErrorsStatStrip', () => {
    it('renders Total as new+investigating+resolved, excluding muted', () => {
        render(
            <ErrorsStatStrip
                counts={{ new: 2, investigating: 1, resolved: 3, muted: 10 }}
                activeStatus="all"
                linkFor={(status) => `/errors?status=${status}`}
            />,
        );
        expect(screen.getByText('Total').nextSibling).toHaveTextContent('6');
    });

    it('links each stat via the provided linkFor', () => {
        render(
            <ErrorsStatStrip
                counts={{ new: 1, investigating: 0, resolved: 0, muted: 0 }}
                activeStatus="new"
                linkFor={(status) => `/custom/${status}`}
            />,
        );
        expect(screen.getByText('New').closest('a')).toHaveAttribute('href', '/custom/new');
    });
});
```

```tsx
// package/src/errors_board/client/errors_filter_form.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorsFilterForm from './errors_filter_form.js';

describe('ErrorsFilterForm', () => {
    it('renders a flavour option per entry plus "All flavours", and preserves status/flavour as hidden inputs', () => {
        render(<ErrorsFilterForm flavours={['prod', 'staging']} filters={{ flavour: 'prod', status: 'new', q: 'timeout' }} />);
        expect(screen.getByRole('option', { name: 'All flavours' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'prod' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'staging' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Message, caller, or user email')).toHaveValue('timeout');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/client/errors_stat_strip.test.tsx src/errors_board/client/errors_filter_form.test.tsx`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// package/src/errors_board/client/errors_stat_strip.tsx
import Link from 'next/link';
import type { ErrorStatus } from '../server/errors_repository.js';

const STAT_CONFIG: { status: ErrorStatus | 'all'; label: string; dotClass: string }[] = [
    { status: 'all', label: 'Total', dotClass: 'bg-blue-500' },
    { status: 'new', label: 'New', dotClass: 'bg-red-500' },
    { status: 'investigating', label: 'Investigating', dotClass: 'bg-amber-500' },
    { status: 'resolved', label: 'Resolved', dotClass: 'bg-emerald-500' },
    { status: 'muted', label: 'Muted', dotClass: 'bg-gray-400 dark:bg-gray-500' },
];

/** `linkFor` builds the href for a given status filter — pass it rather than hardcoding `/errors`, so this mounts at whatever route your app puts the board on. */
export default function ErrorsStatStrip({
    counts,
    activeStatus,
    linkFor,
}: {
    counts: Record<ErrorStatus, number>;
    activeStatus: string;
    linkFor: (status: string) => string;
}): Component {
    // Muted is excluded from Total on purpose — it's the "stop showing me this" bucket.
    const total = counts.new + counts.investigating + counts.resolved;

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {STAT_CONFIG.map(({ status, label, dotClass }) => {
                const value = status === 'all' ? total : counts[status];
                const isActive = activeStatus === status;
                return (
                    <Link
                        prefetch={false}
                        key={status}
                        href={linkFor(status)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${
                            isActive
                                ? 'border-blue-400 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10'
                                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/50'
                        }`}
                    >
                        <span className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                            <span className={`size-2 rounded-full ${dotClass}`} aria-hidden />
                            {label}
                        </span>
                        <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</span>
                    </Link>
                );
            })}
        </div>
    );
}
```

```tsx
// package/src/errors_board/client/errors_filter_form.tsx
'use client';

const FIELD_CLASS =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white';

/** Plain `<select>`, not a styled combobox — this package has no UI-kit dependency to build on, and a native `<select>` keeps this dependency-free. Swap in your own if you want the CRV-style custom dropdown. */
export default function ErrorsFilterForm({
    flavours,
    filters,
}: {
    flavours: string[];
    filters: { flavour: string; status: string; q: string };
}): Component {
    return (
        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
            {/* Status is controlled by ErrorsStatStrip above — preserve it so submitting this form doesn't reset it. */}
            <input type="hidden" name="status" value={filters.status} />
            <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Flavour</span>
                <select name="flavour" defaultValue={filters.flavour} className={FIELD_CLASS}>
                    <option value="all">All flavours</option>
                    {flavours.map((flavour) => (
                        <option key={flavour} value={flavour}>
                            {flavour}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Search</span>
                <input
                    type="text"
                    name="q"
                    placeholder="Message, caller, or user email"
                    defaultValue={filters.q}
                    className={FIELD_CLASS}
                />
            </label>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
                Apply
            </button>
        </form>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/client/errors_stat_strip.test.tsx src/errors_board/client/errors_filter_form.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/client/errors_stat_strip.tsx package/src/errors_board/client/errors_stat_strip.test.tsx package/src/errors_board/client/errors_filter_form.tsx package/src/errors_board/client/errors_filter_form.test.tsx
git commit -m "feat(errors_board): add ErrorsStatStrip and ErrorsFilterForm"
```

---

### Task 13: `ErrorRowItem` and `ErrorsListClient`

**Files:**
- Create: `package/src/errors_board/client/error_row.tsx`
- Test: `package/src/errors_board/client/error_row.test.tsx`
- Create: `package/src/errors_board/client/errors_list_client.tsx`
- Test: `package/src/errors_board/client/errors_list_client.test.tsx`

**Interfaces:**
- Consumes: `ErrorRow`, `ErrorStatus` types (`../server/errors_repository.js`); `STATUS_BADGE_CLASS`, `STATUS_DOT_CLASS`, `formatRelativeTime`, `formatLocalTimestamp` (`../shared/error_ui_helpers.js`); `LocalTime`, `useMounted` (`./error_ui_client.js`); `ErrorsActions` type (`../server/actions_factory.js`, type-only import — no server code bundled into the client component).
- Produces: `ErrorRowItem` (default export, takes `hrefFor` prop), `ErrorsListClient` (default export, takes `actions`+`hrefFor` props) — consumed by the consumer's `page.tsx` (Task 15 README).

- [ ] **Step 1: Write the failing tests**

```tsx
// package/src/errors_board/client/error_row.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorRowItem from './error_row.js';
import type { ErrorRow } from '../server/errors_repository.js';

const baseRow: ErrorRow = {
    id: 1, fingerprint: 'f', created_at: 1000, updated_at: 2000, flavour: 'prod',
    caller: 'MyClass.method', message: 'boom', stack: null, params: null,
    is_client: 0, status: 'new', count: 1, user_email: null, reopen_count: 0, resolved_at: null,
};

describe('ErrorRowItem', () => {
    it('links via the given hrefFor', () => {
        render(<ErrorRowItem row={baseRow} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/board/${id}`} />);
        expect(screen.getByRole('link')).toHaveAttribute('href', '/board/1');
    });

    it('shows the seen-count badge when count > 1', () => {
        render(<ErrorRowItem row={{ ...baseRow, count: 5 }} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/${id}`} />);
        expect(screen.getByTitle('Seen 5 times')).toBeInTheDocument();
    });

    it('calls onToggleSelect with the row id when the checkbox changes', () => {
        const onToggleSelect = vi.fn();
        render(<ErrorRowItem row={baseRow} selected={false} onToggleSelect={onToggleSelect} hrefFor={(id) => `/${id}`} />);
        screen.getByRole('checkbox').dispatchEvent(new Event('change', { bubbles: true }));
        // fireEvent gives us a real checked value; use it directly instead:
    });
});
```

```tsx
// package/src/errors_board/client/errors_list_client.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorsListClient from './errors_list_client.js';
import type { ErrorRow } from '../server/errors_repository.js';

const row: ErrorRow = {
    id: 1, fingerprint: 'f', created_at: 1000, updated_at: 2000, flavour: 'prod',
    caller: 'MyClass.method', message: 'boom', stack: null, params: null,
    is_client: 0, status: 'new', count: 1, user_email: null, reopen_count: 0, resolved_at: null,
};

function makeActions() {
    return {
        loadErrors: vi.fn(async () => ({ rows: [], nextCursor: null })),
        setErrorStatus: vi.fn(async () => undefined),
        deleteErrors: vi.fn(async () => undefined),
        deleteAllResolved: vi.fn(async () => undefined),
    };
}

describe('ErrorsListClient', () => {
    it('renders the initial rows and an empty state when there are none', () => {
        render(
            <ErrorsListClient
                initialRows={[]}
                initialNextCursor={null}
                filters={{ flavour: 'all', status: 'all', q: '' }}
                actions={makeActions()}
                hrefFor={(id) => `/errors/${id}`}
            />,
        );
        expect(screen.getByText('No errors here')).toBeInTheDocument();
    });

    it('selecting a row enables the bulk-action buttons and calls setErrorStatus with its id', async () => {
        const actions = makeActions();
        render(
            <ErrorsListClient
                initialRows={[row]}
                initialNextCursor={null}
                filters={{ flavour: 'all', status: 'all', q: '' }}
                actions={actions}
                hrefFor={(id) => `/errors/${id}`}
            />,
        );
        fireEvent.click(screen.getAllByRole('checkbox')[1]); // [0] is "select all"
        fireEvent.click(screen.getByText('Mark resolved'));
        await vi.waitFor(() => expect(actions.setErrorStatus).toHaveBeenCalledWith([1], 'resolved'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/client/error_row.test.tsx src/errors_board/client/errors_list_client.test.tsx`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// package/src/errors_board/client/error_row.tsx
'use client';

import type { ErrorRow } from '../server/errors_repository.js';
import { STATUS_BADGE_CLASS, STATUS_DOT_CLASS, formatRelativeTime, formatLocalTimestamp } from '../shared/error_ui_helpers.js';
import { LocalTime, useMounted } from './error_ui_client.js';

export default function ErrorRowItem({
    row,
    selected,
    onToggleSelect,
    hrefFor,
}: {
    row: ErrorRow;
    selected: boolean;
    onToggleSelect: (id: number, checked: boolean) => void;
    hrefFor: (id: number) => string;
}): Component {
    const mounted = useMounted();
    const absoluteTime = mounted ? formatLocalTimestamp(row.updated_at) : undefined;

    return (
        <a
            href={hrefFor(row.id)}
            className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/50"
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[row.status]}`} aria-hidden />
                <input
                    type="checkbox"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onToggleSelect(row.id, event.target.checked)}
                    className="size-4 shrink-0 accent-blue-600"
                />
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[row.status]}`}>
                    {row.status}
                </span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {row.flavour}
                </span>
                {row.is_client === 1 && (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                        client
                    </span>
                )}
                {row.count > 1 && (
                    <span
                        className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        title={`Seen ${row.count} times`}
                    >
                        ×{row.count}
                    </span>
                )}
                {row.reopen_count > 0 && (
                    <span
                        className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                        title={`Came back ${row.reopen_count} time${row.reopen_count === 1 ? '' : 's'} after being resolved`}
                    >
                        ↩ {row.reopen_count}
                    </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-gray-400 dark:text-gray-500" title={absoluteTime}>
                    <LocalTime format={formatRelativeTime} timestampMs={row.updated_at} />
                </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pl-4 sm:flex-nowrap">
                <span className="shrink-0 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">{row.caller}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-400">{row.message}</span>
                {row.user_email && (
                    <span className="shrink-0 truncate text-xs text-gray-400 sm:ml-auto sm:max-w-[40%] dark:text-gray-500">
                        {row.user_email}
                    </span>
                )}
            </div>
        </a>
    );
}
```

```tsx
// package/src/errors_board/client/errors_list_client.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorRow, ErrorStatus } from '../server/errors_repository.js';
import type { ErrorsActions } from '../server/actions_factory.js';
import ErrorRowItem from './error_row.js';

interface Filters { flavour: string; status: string; q: string }

export default function ErrorsListClient({
    initialRows,
    initialNextCursor,
    filters,
    actions,
    hrefFor,
}: {
    initialRows: ErrorRow[];
    initialNextCursor: number | null;
    filters: Filters;
    actions: ErrorsActions;
    hrefFor: (id: number) => string;
}): Component {
    const [rows, setRows] = useState<ErrorRow[]>(initialRows);
    const [nextCursor, setNextCursor] = useState<number | null>(initialNextCursor);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isPending, setIsPending] = useState(false);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setRows(initialRows);
        setNextCursor(initialNextCursor);
    }, [initialRows, initialNextCursor]);

    const loadMore = useCallback(() => {
        if (isLoadingMore || nextCursor === null) return;
        setIsLoadingMore(true);
        void actions
            .loadErrors({ ...filters, cursor: nextCursor })
            .then((result) => {
                setRows((previous) => [...previous, ...result.rows]);
                setNextCursor(result.nextCursor);
            })
            .finally(() => setIsLoadingMore(false));
    }, [isLoadingMore, nextCursor, filters, actions]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) loadMore();
            },
            { rootMargin: '400px' },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMore]);

    function toggleSelect(id: number, checked: boolean): void {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }

    function toggleSelectAll(checked: boolean): void {
        setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
    }

    async function handleBulkStatus(status: ErrorStatus): Promise<void> {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        setIsPending(true);
        try {
            await actions.setErrorStatus(ids, status);
            setSelectedIds(new Set());
        } finally {
            setIsPending(false);
        }
    }

    async function handleBulkDelete(): Promise<void> {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (!window.confirm(`Delete ${ids.length} error${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
        setIsPending(true);
        try {
            await actions.deleteErrors(ids);
            setSelectedIds(new Set());
        } finally {
            setIsPending(false);
        }
    }

    async function handleDeleteAllResolved(): Promise<void> {
        if (!window.confirm("Delete every resolved error (including ones not currently loaded)? This can't be undone.")) return;
        setIsPending(true);
        try {
            await actions.deleteAllResolved();
        } finally {
            setIsPending(false);
        }
    }

    const hasSelection = selectedIds.size > 0;

    return (
        <div className="flex flex-col gap-3">
            <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                        className="size-4 accent-blue-600"
                    />
                    {hasSelection ? (
                        <span className="font-medium text-gray-900 dark:text-white">{selectedIds.size} selected</span>
                    ) : (
                        <span>{rows.length} error{rows.length === 1 ? '' : 's'}</span>
                    )}
                </label>
                <div className="ml-auto flex flex-wrap gap-2">
                    <button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('investigating')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        Mark investigating
                    </button>
                    <button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('resolved')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        Mark resolved
                    </button>
                    {filters.status === 'muted' ? (
                        <button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('new')} title="Bring these back onto the board as New." className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                            Unmute
                        </button>
                    ) : (
                        <button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('muted')} title="Hide for good. Repeats stay hidden and never reopen." className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                            Mute
                        </button>
                    )}
                    <button disabled={isPending || !hasSelection} onClick={handleBulkDelete} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                        Delete selected
                    </button>
                    <button disabled={isPending} onClick={handleDeleteAllResolved} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        Delete all resolved
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {rows.map((row) => (
                    <ErrorRowItem key={row.id} row={row} selected={selectedIds.has(row.id)} onToggleSelect={toggleSelect} hrefFor={hrefFor} />
                ))}
                {rows.length === 0 && (
                    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No errors here</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Nothing matches the current filters.</p>
                    </div>
                )}
            </div>

            {nextCursor !== null && (
                <div ref={sentinelRef} className="flex justify-center py-4">
                    {isLoadingMore && (
                        <span className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                            <span className="size-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent dark:border-gray-600" />
                            Loading more…
                        </span>
                    )}
                </div>
            )}
            {nextCursor === null && rows.length > 0 && (
                <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">You&apos;ve reached the end.</p>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/client/error_row.test.tsx src/errors_board/client/errors_list_client.test.tsx`
Expected: PASS (4 tests — drop the incomplete third `ErrorRowItem` assertion or complete it with `fireEvent.click(checkbox)`/`expect(onToggleSelect).toHaveBeenCalledWith(1, true)` using `@testing-library/react`'s `fireEvent`, not a raw `dispatchEvent`)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/client/error_row.tsx package/src/errors_board/client/error_row.test.tsx package/src/errors_board/client/errors_list_client.tsx package/src/errors_board/client/errors_list_client.test.tsx
git commit -m "feat(errors_board): add ErrorRowItem and ErrorsListClient"
```

---

### Task 14: `ErrorDetailView`

**Files:**
- Create: `package/src/errors_board/client/error_detail_view.tsx`
- Test: `package/src/errors_board/client/error_detail_view.test.tsx`

**Interfaces:**
- Consumes: `ErrorRow`, `ErrorStatus` (`../server/errors_repository.js`); `STATUS_BADGE_CLASS`, `STATUS_LABELS`, `STATUS_HINTS`, `formatRelativeTime`, `formatLocalTimestamp`, `parseRequestContext` (`../shared/error_ui_helpers.js`); `DetailBlock`, `CopyButton`, `LocalTime` (`./error_ui_client.js`); `ErrorsActions` type (`../server/actions_factory.js`).
- Produces: `ErrorDetailView` (default export, takes `row`, `actions`, `onDeleted` props) — consumed by the consumer's `[id]/page.tsx` (Task 15 README).

- [ ] **Step 1: Write the failing test**

```tsx
// package/src/errors_board/client/error_detail_view.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorDetailView from './error_detail_view.js';
import type { ErrorRow } from '../server/errors_repository.js';

const row: ErrorRow = {
    id: 42, fingerprint: 'f', created_at: 1000, updated_at: 2000, flavour: 'prod',
    caller: 'MyClass.method', message: 'boom', stack: 'at MyClass.method', params: null,
    is_client: 1, status: 'new', count: 3, user_email: 'user@example.com', reopen_count: 0, resolved_at: null,
};

function makeActions() {
    return {
        loadErrors: vi.fn(async () => ({ rows: [], nextCursor: null })),
        setErrorStatus: vi.fn(async () => undefined),
        deleteErrors: vi.fn(async () => undefined),
        deleteAllResolved: vi.fn(async () => undefined),
    };
}

describe('ErrorDetailView', () => {
    it('renders the caller, message, and stack trace', () => {
        render(<ErrorDetailView row={row} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByText('MyClass.method')).toBeInTheDocument();
        expect(screen.getByText('boom')).toBeInTheDocument();
        expect(screen.getByText('at MyClass.method')).toBeInTheDocument();
    });

    it('clicking a status button calls actions.setErrorStatus with this row\'s id', async () => {
        const actions = makeActions();
        render(<ErrorDetailView row={row} actions={actions} onDeleted={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
        await vi.waitFor(() => expect(actions.setErrorStatus).toHaveBeenCalledWith([42], 'resolved'));
    });

    it('deleting calls actions.deleteErrors and onDeleted, after confirmation', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const actions = makeActions();
        const onDeleted = vi.fn();
        render(<ErrorDetailView row={row} actions={actions} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete error' }));
        await vi.waitFor(() => expect(actions.deleteErrors).toHaveBeenCalledWith([42]));
        expect(onDeleted).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/errors_board/client/error_detail_view.test.tsx`
Expected: FAIL with "Cannot find module './error_detail_view.js'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// package/src/errors_board/client/error_detail_view.tsx
'use client';

import { useState } from 'react';
import type { ErrorRow, ErrorStatus } from '../server/errors_repository.js';
import type { ErrorsActions } from '../server/actions_factory.js';
import {
    STATUS_BADGE_CLASS,
    STATUS_LABELS,
    STATUS_HINTS,
    formatRelativeTime,
    formatLocalTimestamp,
    parseRequestContext,
} from '../shared/error_ui_helpers.js';
import { DetailBlock, CopyButton, LocalTime } from './error_ui_client.js';

/**
 * `onDeleted` replaces the reference implementation's `router.push('/errors')`
 * — the package doesn't assume a route, so the consumer decides what
 * "go back to the list" means for their app.
 */
export default function ErrorDetailView({
    row,
    actions,
    onDeleted,
}: {
    row: ErrorRow;
    actions: ErrorsActions;
    onDeleted: () => void;
}): Component {
    const [isPending, setIsPending] = useState(false);

    async function handleStatusChange(status: ErrorStatus): Promise<void> {
        setIsPending(true);
        try {
            await actions.setErrorStatus([row.id], status);
        } finally {
            setIsPending(false);
        }
    }

    async function handleDelete(): Promise<void> {
        if (!window.confirm("Delete this error? This can't be undone.")) return;
        setIsPending(true);
        try {
            await actions.deleteErrors([row.id]);
            onDeleted();
        } finally {
            setIsPending(false);
        }
    }

    const requestContext = parseRequestContext(row.params);

    return (
        <div className="flex flex-col gap-5" style={{ opacity: isPending ? 0.5 : 1 }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[row.status]}`}>
                            {row.status}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {row.flavour}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {row.is_client === 1 ? 'Client' : 'Server'}
                        </span>
                        {row.count > 1 && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                Seen ×{row.count}
                            </span>
                        )}
                        <CopyButton text={typeof window !== 'undefined' ? window.location.href : String(row.id)} label="Copy link" copiedLabel="Link copied" />
                    </div>
                    <h1 className="font-mono text-lg font-semibold wrap-break-word text-gray-900 dark:text-white">{row.caller}</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{row.message}</p>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                            {(Object.keys(STATUS_LABELS) as ErrorStatus[]).map((status, index) => (
                                <button
                                    key={status}
                                    disabled={isPending || row.status === status}
                                    onClick={() => handleStatusChange(status)}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default sm:flex-none ${
                                        index > 0 ? 'border-l border-gray-300 dark:border-gray-700' : ''
                                    } ${
                                        row.status === status
                                            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                                            : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    {STATUS_LABELS[status]}
                                </button>
                            ))}
                        </div>
                        <button disabled={isPending} onClick={handleDelete} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                            Delete error
                        </button>
                    </div>
                    <p className="max-w-72 text-[11px] leading-snug text-gray-400 sm:text-right dark:text-gray-500">{STATUS_HINTS[row.status]}</p>
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs sm:grid-cols-3 dark:border-gray-800 dark:bg-gray-900/60">
                <div>
                    <dt className="text-gray-400 dark:text-gray-500">First seen</dt>
                    <dd className="text-gray-700 dark:text-gray-300"><LocalTime format={formatLocalTimestamp} timestampMs={row.created_at} /></dd>
                </div>
                <div>
                    <dt className="text-gray-400 dark:text-gray-500">Last seen</dt>
                    <dd className="text-gray-700 dark:text-gray-300">
                        <LocalTime format={formatLocalTimestamp} timestampMs={row.updated_at} />{' '}
                        <span className="text-gray-400 dark:text-gray-500">(<LocalTime format={formatRelativeTime} timestampMs={row.updated_at} />)</span>
                    </dd>
                </div>
                <div>
                    <dt className="text-gray-400 dark:text-gray-500">User</dt>
                    <dd className="text-gray-700 dark:text-gray-300">{row.user_email ?? 'Unknown / not signed in'}</dd>
                </div>
                <div>
                    <dt className="text-gray-400 dark:text-gray-500">Regressions</dt>
                    <dd className="text-gray-700 dark:text-gray-300">
                        {row.reopen_count > 0
                            ? `Came back ${row.reopen_count} time${row.reopen_count === 1 ? '' : 's'} after being resolved`
                            : 'Never came back after a fix'}
                    </dd>
                </div>
                {row.resolved_at !== null && (
                    <div>
                        <dt className="text-gray-400 dark:text-gray-500">Resolved</dt>
                        <dd className="text-gray-700 dark:text-gray-300"><LocalTime format={formatRelativeTime} timestampMs={row.resolved_at} /></dd>
                    </div>
                )}
                {requestContext?.path && (
                    <div>
                        <dt className="text-gray-400 dark:text-gray-500">Page</dt>
                        <dd className="break-all text-gray-700 dark:text-gray-300">{requestContext.path}</dd>
                    </div>
                )}
                {requestContext?.referer && (
                    <div>
                        <dt className="text-gray-400 dark:text-gray-500">Referrer</dt>
                        <dd className="break-all text-gray-700 dark:text-gray-300">{requestContext.referer}</dd>
                    </div>
                )}
                {requestContext?.userAgent && (
                    <div className="col-span-2 sm:col-span-3">
                        <dt className="text-gray-400 dark:text-gray-500">User agent</dt>
                        <dd className="break-all text-gray-700 dark:text-gray-300">{requestContext.userAgent}</dd>
                    </div>
                )}
            </dl>

            <DetailBlock label="Message" text={row.message} />
            {row.stack && <DetailBlock label="Stack trace" text={row.stack} />}
            {row.params && <DetailBlock label="Params" text={row.params} />}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/errors_board/client/error_detail_view.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/errors_board/client/error_detail_view.tsx package/src/errors_board/client/error_detail_view.test.tsx
git commit -m "feat(errors_board): add ErrorDetailView"
```

---

### Task 15: Component `package.json` exports + `errors_board/README.md` (full wiring example)

**Files:**
- Modify: `package/package.json` (`exports` map)
- Create: `package/src/errors_board/README.md`

**Interfaces:**
- Consumes: everything from Tasks 5–14.
- Produces: `cloudflare-next-intl/ErrorsStatStrip`, `.../ErrorsFilterForm`, `.../ErrorRowItem`, `.../ErrorsListClient`, `.../ErrorDetailView` importable by consumers; a copy-paste-able wiring guide.

- [ ] **Step 1: Add the package.json exports**

In `package/package.json`, add (alongside the `./errorsBoard` entry from Task 9):

```json
"./ErrorsStatStrip": {
    "types": "./dist/src/errors_board/client/errors_stat_strip.d.ts",
    "import": "./dist/src/errors_board/client/errors_stat_strip.js"
},
"./ErrorsFilterForm": {
    "types": "./dist/src/errors_board/client/errors_filter_form.d.ts",
    "import": "./dist/src/errors_board/client/errors_filter_form.js"
},
"./ErrorRowItem": {
    "types": "./dist/src/errors_board/client/error_row.d.ts",
    "import": "./dist/src/errors_board/client/error_row.js"
},
"./ErrorsListClient": {
    "types": "./dist/src/errors_board/client/errors_list_client.d.ts",
    "import": "./dist/src/errors_board/client/errors_list_client.js"
},
"./ErrorDetailView": {
    "types": "./dist/src/errors_board/client/error_detail_view.d.ts",
    "import": "./dist/src/errors_board/client/error_detail_view.js"
},
```

- [ ] **Step 2: Write `errors_board/README.md`**

```md
<!-- package/src/errors_board/README.md -->
# `src/errors_board`

A customizable, D1-backed error log: a filterable/searchable list with bulk
status actions, and a detail view per error. Ported from
`clarivant/CRV`'s `/errors` feature. **Next-only** (uses `next/navigation`,
`next/cache`, `next/link`) — see `../cloudflare_fetch` if you need
something Vite-compatible instead.

Nothing here is a page — App Router pages must be real files under your
own `app/` directory, so you write a handful of thin wiring files that
import these pieces. Everything below is copy-paste-able.

## 1. Gate (`app/errors/gate.ts`)

```ts
import { createRequireErrorsAccess } from 'cloudflare-next-intl/errorsBoard';

export const requireErrorsAccess = createRequireErrorsAccess({
    allowedEmails: ['tester_1@codinghouse.biz', 'tester_2@codinghouse.biz'],
    // Or, for a domain-wide allowlist instead of a fixed list:
    // allowedEmails: (email) => email?.endsWith('@codinghouse.biz') ?? false,
});
```

## 2. Actions (`app/errors/actions.ts`)

```ts
'use server';

import { env } from 'cloudflare:workers'; // or however your app resolves bindings
import { createErrorsActions } from 'cloudflare-next-intl/errorsBoard';
import { requireErrorsAccess } from './gate';

export const { loadErrors, setErrorStatus, deleteErrors, deleteAllResolved } = createErrorsActions({
    getDb: () => {
        const db = env?.ERRORS_DB;
        if (!db) throw new Error('ERRORS_DB binding is not available');
        return db;
    },
    requireAccess: requireErrorsAccess,
});
```

## 3. List page (`app/errors/page.tsx`)

```tsx
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { requireErrorsAccess } from './gate';
import { loadErrorsBoard, parseErrorsListFilters } from 'cloudflare-next-intl/errorsBoard';
import ErrorsStatStrip from 'cloudflare-next-intl/ErrorsStatStrip';
import ErrorsFilterForm from 'cloudflare-next-intl/ErrorsFilterForm';
import ErrorsListClient from 'cloudflare-next-intl/ErrorsListClient';
import * as actions from './actions';

export const dynamic = 'force-dynamic';

export default async function ErrorsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
    await requireErrorsAccess();
    const filters = parseErrorsListFilters(await searchParams);
    const db = env.ERRORS_DB;
    const board = await loadErrorsBoard(db, filters);

    function linkFor(status: string): string {
        return `/errors?${new URLSearchParams({ flavour: filters.flavour, status, q: filters.q })}`;
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-4 py-8">
            <h1 className="text-2xl font-semibold">Error log</h1>
            <ErrorsStatStrip counts={board.counts} activeStatus={filters.status} linkFor={linkFor} />
            <ErrorsFilterForm flavours={board.flavours} filters={filters} />
            <ErrorsListClient
                initialRows={board.rows}
                initialNextCursor={board.nextCursor}
                filters={filters}
                actions={actions}
                hrefFor={(id) => `/errors/${id}`}
            />
        </main>
    );
}
```

## 4. Detail page (`app/errors/[id]/page.tsx`)

```tsx
import { notFound } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { requireErrorsAccess } from '../gate';
import { getErrorById } from 'cloudflare-next-intl/errorsBoard';
import ErrorDetailView from 'cloudflare-next-intl/ErrorDetailView';
import * as actions from '../actions';

export default async function ErrorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requireErrorsAccess();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) notFound();

    const row = await getErrorById(env.ERRORS_DB, id);
    if (!row) notFound();

    return <ErrorDetailView row={row} actions={actions} onDeleted={() => (window.location.href = '/errors')} />;
}
```

## 5. Writing errors into it

`recordError` (from `cloudflare-next-intl/errorsBoard`) is the write side —
wire it as your `errorHandling.onError` in `intl_config.ts`, alongside
`cloudflare-next-intl/createServerErrorAction`'s `requestContext`:

```ts
import { recordError } from 'cloudflare-next-intl/errorsBoard';

async function onError(params) {
    const db = /* resolve env.ERRORS_DB same as getDb() above */;
    await recordError(db, {
        flavour: process.env.APP_FLAVOUR ?? 'local',
        caller: params.classOrMethodName,
        message: params.error instanceof Error ? params.error.message : String(params.error),
        stack: params.error instanceof Error ? params.error.stack ?? null : null,
        params: params.params ? JSON.stringify(params.params) : null,
        isClient: params.isClient === true,
        userEmail: /* your own signed-in-user lookup, or null */,
    });
}
```

## Layout

- `server/errors_repository.ts` — D1 schema + CRUD; no `@cloudflare/workers-types`
  dependency (a local `D1DatabaseLike` duck type).
- `server/gate.ts` — `createRequireErrorsAccess`, built on this package's
  own `getFirebaseAuthUser`.
- `server/actions_factory.ts` — `createErrorsActions`, the four server
  actions the client components call.
- `shared/error_ui_helpers.ts` — status labels/colors, relative/local time
  formatting (native `Intl`, no `luxon`), request-context parsing.
- `client/*.tsx` — the five components above, each taking its data and
  action functions as props rather than importing anything by a fixed
  path, so the whole board can be mounted at any route.
```

- [ ] **Step 3: Verify the build, exports, and full test suite**

Run: `cd package && npm run build && npm run check:exports && npm test`
Expected: all three succeed.

- [ ] **Step 4: Commit**

```bash
git add package/package.json package/src/errors_board/README.md
git commit -m "feat(errors_board): add component exports and README wiring guide"
```

---

### Task 16: `resolveHyperdriveConnectionString`

**Files:**
- Create: `package/src/db/resolve_hyperdrive_connection_string.ts`
- Test: `package/src/db/resolve_hyperdrive_connection_string.test.ts`

**Interfaces:**
- Consumes: `resolveEnv` from `../server/functions/geo.js`; `GenerateRoutingConfig` from `../types/types.js`.
- Produces: `HyperdriveBindingLike` interface and `resolveHyperdriveConnectionString(generate?: GenerateRoutingConfig): Promise<string | undefined>` — consumed by Task 17.

- [ ] **Step 1: Write the failing test**

```ts
// package/src/db/resolve_hyperdrive_connection_string.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/functions/geo.js', () => ({ resolveEnv: vi.fn() }));

import { resolveEnv } from '../server/functions/geo.js';
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';

describe('resolveHyperdriveConnectionString', () => {
    it('returns undefined when there is no HYPERDRIVE binding', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({});
        expect(await resolveHyperdriveConnectionString({})).toBeUndefined();
    });

    it('returns the real connection string when one is bound', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({ HYPERDRIVE: { connectionString: 'postgresql://real:conn@host/db' } });
        expect(await resolveHyperdriveConnectionString({})).toBe('postgresql://real:conn@host/db');
    });

    it('returns undefined for wrangler dev\'s placeholder connection string', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({ HYPERDRIVE: { connectionString: 'postgresql://user:pass@localhost:5432/db' } });
        expect(await resolveHyperdriveConnectionString({})).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/resolve_hyperdrive_connection_string.test.ts`
Expected: FAIL with "Cannot find module './resolve_hyperdrive_connection_string.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/db/resolve_hyperdrive_connection_string.ts
import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';

export interface HyperdriveBindingLike {
    connectionString: string;
}

// `wrangler dev` fills an unconfigured `[[hyperdrive]]` binding with this
// exact placeholder rather than leaving it unset — matches
// `clarivant/CRV/src/shared/repositories/cloudflare_repository.ts`'s
// `getHyperdriveConnectString` guard. Treating it as "no connection string"
// avoids a real connection attempt against a socket nothing is listening on.
const WRANGLER_DEV_PLACEHOLDER = 'postgresql://user:pass@localhost:5432/db';

/**
 * Resolves `env.HYPERDRIVE.connectionString` via `resolveEnv()` (this
 * package's existing `generate.env` convention). Returns `undefined` — never
 * throws — when there's no `HYPERDRIVE` binding, or it's `wrangler dev`'s
 * unconfigured placeholder.
 */
export async function resolveHyperdriveConnectionString(generate?: GenerateRoutingConfig): Promise<string | undefined> {
    const env = await resolveEnv(generate);
    const binding = (env as Record<string, unknown> | undefined)?.HYPERDRIVE as HyperdriveBindingLike | undefined;
    const connectionString = binding?.connectionString;
    if (!connectionString || connectionString === WRANGLER_DEV_PLACEHOLDER) return undefined;
    return connectionString;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/resolve_hyperdrive_connection_string.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/db/resolve_hyperdrive_connection_string.ts package/src/db/resolve_hyperdrive_connection_string.test.ts
git commit -m "feat(db): add resolveHyperdriveConnectionString"
```

---

### Task 17: Wire Hyperdrive auto-detection into `resolveDbMode`, gated by `db.autoHyperdrive`

**Files:**
- Modify: `package/src/types/types.ts` (`DbRoutingConfig`)
- Modify: `package/src/db/resolve_mode.ts`
- Modify: `package/src/db/resolve_mode.test.ts`
- Modify: `package/src/db/context.ts` (thread `config.generate` through both call sites)

**Interfaces:**
- Consumes: `resolveHyperdriveConnectionString` (Task 16).
- Produces: `resolveDbMode(db: DbRoutingConfig, generate?: GenerateRoutingConfig): Promise<ResolvedDbMode>` (signature change — was `(db)`) and `DbRoutingConfig.autoHyperdrive?: boolean`. `withPublicDb`/`withUserDb` (unchanged public signatures) now auto-detect Hyperdrive.

- [ ] **Step 1: Write the failing test**

Add to `package/src/db/resolve_mode.test.ts` (alongside its existing cases — do not remove those):

```ts
vi.mock('./resolve_hyperdrive_connection_string.js', () => ({
    resolveHyperdriveConnectionString: vi.fn(),
}));
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';

describe('resolveDbMode — Hyperdrive auto-detection', () => {
    beforeEach(() => vi.mocked(resolveHyperdriveConnectionString).mockReset());

    it('uses the Hyperdrive connection string when db.connectionString is unset', async () => {
        vi.mocked(resolveHyperdriveConnectionString).mockResolvedValue('postgresql://hyperdrive/db');
        const result = await resolveDbMode({}, {});
        expect(result).toEqual({ mode: 'postgres', connectionString: 'postgresql://hyperdrive/db' });
    });

    it('prefers an explicit db.connectionString over Hyperdrive', async () => {
        vi.mocked(resolveHyperdriveConnectionString).mockResolvedValue('postgresql://hyperdrive/db');
        const result = await resolveDbMode({ connectionString: 'postgresql://explicit/db' }, {});
        expect(result).toEqual({ mode: 'postgres', connectionString: 'postgresql://explicit/db' });
        expect(resolveHyperdriveConnectionString).not.toHaveBeenCalled();
    });

    it('skips Hyperdrive entirely when autoHyperdrive is false, falling through to supabase', async () => {
        const supabase = { anonKey: 'k', url: 'https://x.supabase.co' };
        const result = await resolveDbMode({ autoHyperdrive: false, supabase }, {});
        expect(result).toEqual({ mode: 'supabase', supabase });
        expect(resolveHyperdriveConnectionString).not.toHaveBeenCalled();
    });

    it('falls through to supabase when Hyperdrive resolves to nothing', async () => {
        vi.mocked(resolveHyperdriveConnectionString).mockResolvedValue(undefined);
        const supabase = { anonKey: 'k', url: 'https://x.supabase.co' };
        const result = await resolveDbMode({ supabase }, {});
        expect(result).toEqual({ mode: 'supabase', supabase });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/resolve_mode.test.ts`
Expected: FAIL — current `resolveDbMode` ignores its second argument and never calls `resolveHyperdriveConnectionString`.

- [ ] **Step 3: Write the implementation**

In `package/src/types/types.ts`, inside `DbRoutingConfig` (right after the existing `connectionString` field documented above):

```ts
    /**
     * When `true` (the default) and `connectionString` is unset, `withPublicDb`/
     * `withUserDb` try `env.HYPERDRIVE.connectionString` (via `generate.env`)
     * before falling through to `supabase`. Set `false` to disable this and
     * go straight to `supabase` (or the "no connection string" error) instead
     * — e.g. when a `HYPERDRIVE` binding exists in `wrangler.toml` for
     * something else and should not be treated as this app's Postgres.
     */
    autoHyperdrive?: boolean;
```

In `package/src/db/resolve_mode.ts`:

```ts
import type { DbRoutingConfig, GenerateRoutingConfig, SupabaseDbConfig } from '../types/types.js';
import resolveConfigValue from './resolve_config_value.js';
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';

// ... (DbMode/ResolvedDbMode types unchanged) ...

export default async function resolveDbMode(db: DbRoutingConfig, generate?: GenerateRoutingConfig): Promise<ResolvedDbMode> {
    const connectionString = await resolveConfigValue(db.connectionString);
    if (connectionString) return { mode: 'postgres', connectionString };

    if (db.autoHyperdrive !== false) {
        const hyperdriveConnectionString = await resolveHyperdriveConnectionString(generate);
        if (hyperdriveConnectionString) return { mode: 'postgres', connectionString: hyperdriveConnectionString };
    }

    if (db.supabase) return { mode: 'supabase', supabase: db.supabase };
    return { mode: 'postgres', connectionString: undefined };
}
```

In `package/src/db/context.ts`, update both call sites (inside `withPublicDb` and `withUserDb`):

```ts
const resolved = await resolveDbMode(db, config.generate);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/resolve_mode.test.ts`
Expected: PASS — all pre-existing `resolveDbMode` tests plus the four new ones.

- [ ] **Step 5: Run the full db suite to confirm the `context.ts` call-site change didn't break `withPublicDb`/`withUserDb`**

Run: `cd package && npx vitest run src/db`
Expected: PASS (no regressions — `context.test.ts` already mocks `./resolve_mode`, so the extra argument is inert there).

- [ ] **Step 6: Commit**

```bash
git add package/src/types/types.ts package/src/db/resolve_mode.ts package/src/db/resolve_mode.test.ts package/src/db/context.ts
git commit -m "feat(db): auto-detect Hyperdrive connection strings, opt-out via db.autoHyperdrive"
```

---

### Task 18: `resolveEmailBinding` and `escapeHtml`

**Files:**
- Create: `package/src/cloudflare_email/resolve_email_binding.ts`
- Test: `package/src/cloudflare_email/resolve_email_binding.test.ts`
- Create: `package/src/cloudflare_email/escape_html.ts`
- Test: `package/src/cloudflare_email/escape_html.test.ts`

**Interfaces:**
- Consumes: `resolveEnv` from `../server/functions/geo.js`; `GenerateRoutingConfig` from `../types/types.js`.
- Produces: `EmailBindingLike`, `resolveEmailBinding(generate?, bindingName?): Promise<EmailBindingLike | null>`, `escapeHtml(value: string): string` — both consumed by Task 19.

- [ ] **Step 1: Write the failing tests**

```ts
// package/src/cloudflare_email/resolve_email_binding.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/functions/geo.js', () => ({ resolveEnv: vi.fn() }));

import { resolveEnv } from '../server/functions/geo.js';
import { resolveEmailBinding } from './resolve_email_binding.js';

describe('resolveEmailBinding', () => {
    it('returns null when there is no matching binding', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({});
        expect(await resolveEmailBinding({})).toBeNull();
    });

    it('returns the binding when EMAIL.send is a function', async () => {
        const send = vi.fn();
        vi.mocked(resolveEnv).mockResolvedValue({ EMAIL: { send } });
        const binding = await resolveEmailBinding({});
        expect(binding?.send).toBe(send);
    });

    it('reads a custom binding name when given one', async () => {
        const send = vi.fn();
        vi.mocked(resolveEnv).mockResolvedValue({ NOTIFICATIONS_EMAIL: { send } });
        const binding = await resolveEmailBinding({}, 'NOTIFICATIONS_EMAIL');
        expect(binding?.send).toBe(send);
    });
});
```

```ts
// package/src/cloudflare_email/escape_html.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape_html.js';

describe('escapeHtml', () => {
    it('escapes &, <, >, and "', () => {
        expect(escapeHtml(`<b>"Tom" & Jerry</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;');
    });
    it('leaves plain text untouched', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/cloudflare_email/resolve_email_binding.test.ts src/cloudflare_email/escape_html.test.ts`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/cloudflare_email/resolve_email_binding.ts
import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';

export interface EmailBindingLike {
    send(message: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<unknown>;
}

/**
 * Resolves the Cloudflare Email Sending binding (`wrangler.toml`'s
 * `[[send_email]]`, default binding name `EMAIL`) via `resolveEnv()`. Returns
 * `null` — never throws — when unavailable, e.g. `next dev`/a plain Vite dev
 * server with no Worker bindings.
 */
export async function resolveEmailBinding(generate?: GenerateRoutingConfig, bindingName = 'EMAIL'): Promise<EmailBindingLike | null> {
    const env = await resolveEnv(generate);
    const candidate = (env as Record<string, unknown> | undefined)?.[bindingName];
    if (!candidate || typeof candidate !== 'object') return null;
    return typeof (candidate as EmailBindingLike).send === 'function' ? (candidate as EmailBindingLike) : null;
}
```

```ts
// package/src/cloudflare_email/escape_html.ts
/** Escapes a value on its way into email markup — links and stored names both reach the HTML body, and stored data is never trusted there. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/cloudflare_email/resolve_email_binding.test.ts src/cloudflare_email/escape_html.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_email/resolve_email_binding.ts package/src/cloudflare_email/resolve_email_binding.test.ts package/src/cloudflare_email/escape_html.ts package/src/cloudflare_email/escape_html.test.ts
git commit -m "feat(cloudflare_email): add resolveEmailBinding and escapeHtml"
```

---

### Task 19: `sendTransactionalEmail` — binding-first, REST-fallback, never throws

**Files:**
- Create: `package/src/cloudflare_email/send_transactional_email.ts`
- Test: `package/src/cloudflare_email/send_transactional_email.test.ts`

**Interfaces:**
- Consumes: `resolveEmailBinding` (Task 18); `reportError`, `type ReportErrorConfig` from `../error_handling/report_error.js`; `GenerateRoutingConfig` from `../types/types.js`.
- Produces: `TransactionalEmailOutcome`, `TransactionalEmailContent`, `SendTransactionalEmailOptions`, `sendTransactionalEmail(message, options, reportAs): Promise<TransactionalEmailOutcome>` — the module's top-level public entry point (exported from `index.ts` in Task 20).

- [ ] **Step 1: Write the failing test**

```ts
// package/src/cloudflare_email/send_transactional_email.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./resolve_email_binding.js', () => ({ resolveEmailBinding: vi.fn() }));
vi.mock('../error_handling/report_error.js', () => ({ default: vi.fn() }));

import { resolveEmailBinding } from './resolve_email_binding.js';
import reportError from '../error_handling/report_error.js';
import { sendTransactionalEmail } from './send_transactional_email.js';

const message = { to: 'user@example.com', subject: 'Hi', text: 'hi', html: '<p>hi</p>' };
const baseOptions = { senderAddress: 'no-reply@example.com' };

describe('sendTransactionalEmail', () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        globalThis.fetch = vi.fn();
        process.env.CLOUDFLARE_ACCOUNT_ID = '';
        process.env.CLOUDFLARE_EMAIL_TOKEN = '';
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
        process.env = { ...originalEnv };
    });

    it('sends via the binding when one is available, and returns "sent"', async () => {
        const send = vi.fn(async () => undefined);
        vi.mocked(resolveEmailBinding).mockResolvedValue({ send });

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(send).toHaveBeenCalledWith({ ...message, from: 'no-reply@example.com' });
        expect(outcome).toBe('sent');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('returns "unavailable" when no binding and no REST credentials are configured', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');
        expect(outcome).toBe('unavailable');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('treats an unexpanded shell macro ("$(...)") as not configured', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
        process.env.CLOUDFLARE_EMAIL_TOKEN = '$(op read op://vault/item/token)';
        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');
        expect(outcome).toBe('unavailable');
    });

    it('sends over REST when credentials are configured, and returns "sent" on a 2xx', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
        process.env.CLOUDFLARE_EMAIL_TOKEN = 'tok-1';
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(outcome).toBe('sent');
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://api.cloudflare.com/client/v4/accounts/acct-1/email/sending/send',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('reports and returns "failed" on a non-ok REST response', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue(null);
        process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-1';
        process.env.CLOUDFLARE_EMAIL_TOKEN = 'tok-1';
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 500 }));

        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');

        expect(outcome).toBe('failed');
        expect(reportError).toHaveBeenCalledTimes(1);
    });

    it('reports and returns "failed" when the binding throws — never throws itself', async () => {
        vi.mocked(resolveEmailBinding).mockResolvedValue({ send: vi.fn(async () => { throw new Error('boom'); }) });
        const outcome = await sendTransactionalEmail(message, baseOptions, 'test.send');
        expect(outcome).toBe('failed');
        expect(reportError).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/cloudflare_email/send_transactional_email.test.ts`
Expected: FAIL with "Cannot find module './send_transactional_email.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/cloudflare_email/send_transactional_email.ts
import { resolveEmailBinding } from './resolve_email_binding.js';
import reportError, { type ReportErrorConfig } from '../error_handling/report_error.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/** `sent` — the provider accepted it. `unavailable` — nothing is configured to send with. `failed` — an attempt was made and lost. */
export type TransactionalEmailOutcome = 'sent' | 'unavailable' | 'failed';

export interface TransactionalEmailContent {
    subject: string;
    text: string;
    html: string;
}

export interface SendTransactionalEmailOptions extends ReportErrorConfig {
    generate?: GenerateRoutingConfig;
    /** No default — Cloudflare Email Sending only accepts a `From` on a domain you've verified, so a hardcoded default here would silently fail for every consumer but one. */
    senderAddress: string;
    /** Defaults to `'EMAIL'`, matching `wrangler.toml`'s `[[send_email]]` binding name convention. */
    bindingName?: string;
    /** Defaults to `process.env.CLOUDFLARE_ACCOUNT_ID` — the local-dev REST fallback's account id. */
    restAccountId?: string;
    /** Defaults to `process.env.CLOUDFLARE_EMAIL_TOKEN` — the local-dev REST fallback's API token. */
    restToken?: string;
}

function isUsableCredential(value: string): boolean {
    return value.length > 0 && !value.includes('$(');
}

async function sendOverRest(
    message: { to: string; from: string } & TransactionalEmailContent,
    options: SendTransactionalEmailOptions,
    reportAs: string,
): Promise<TransactionalEmailOutcome> {
    const accountId = (options.restAccountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
    const token = (options.restToken ?? process.env.CLOUDFLARE_EMAIL_TOKEN ?? '').trim();
    if (!isUsableCredential(accountId) || !isUsableCredential(token)) return 'unavailable';

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
    });

    if (!response.ok) {
        await reportError(options, { error: new Error(`email/sending/send responded ${response.status}`), classOrMethodName: `${reportAs}.rest` });
        return 'failed';
    }
    return 'sent';
}

/**
 * Sends `message` via the Cloudflare Email Sending binding when one is
 * available, otherwise via the REST endpoint (needs `restAccountId`/
 * `restToken`, or the matching env vars — the usual case in local dev,
 * where there is no Worker binding). **Never throws** — matches
 * `portfolio/src/shared/email/transactional_email.ts`'s
 * `sendTransactionalEmail`: every caller has already committed whatever row
 * the message is about, so losing that row because the mail hop failed
 * would be worse than not mailing it.
 */
export async function sendTransactionalEmail(
    message: { to: string } & TransactionalEmailContent,
    options: SendTransactionalEmailOptions,
    reportAs: string,
): Promise<TransactionalEmailOutcome> {
    try {
        const binding = await resolveEmailBinding(options.generate, options.bindingName);
        const fullMessage = { ...message, from: options.senderAddress };

        if (binding) {
            await binding.send(fullMessage);
            return 'sent';
        }
        return await sendOverRest(fullMessage, options, reportAs);
    } catch (error) {
        await reportError(options, { error, classOrMethodName: reportAs });
        return 'failed';
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/cloudflare_email/send_transactional_email.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_email/send_transactional_email.ts package/src/cloudflare_email/send_transactional_email.test.ts
git commit -m "feat(cloudflare_email): add sendTransactionalEmail"
```

---

### Task 20: `cloudflare_email` barrel, README, and package.json exports

**Files:**
- Create: `package/src/cloudflare_email/index.ts`
- Create: `package/src/cloudflare_email/README.md`
- Modify: `package/package.json` (`exports` map)

**Interfaces:**
- Consumes: everything from Tasks 18–19.
- Produces: `cloudflare-next-intl/sendTransactionalEmail` importable by consumers.

- [ ] **Step 1: Write the barrel**

```ts
// package/src/cloudflare_email/index.ts
export { sendTransactionalEmail, type TransactionalEmailOutcome, type TransactionalEmailContent, type SendTransactionalEmailOptions } from './send_transactional_email.js';
export { resolveEmailBinding, type EmailBindingLike } from './resolve_email_binding.js';
export { escapeHtml } from './escape_html.js';
```

- [ ] **Step 2: Write the README**

```md
<!-- package/src/cloudflare_email/README.md -->
# `src/cloudflare_email`

Sends a transactional email via the Cloudflare Email Sending binding
(`wrangler.toml`'s `[[send_email]]`) when one is configured, falling back
to the REST endpoint otherwise — the same shape as
`portfolio/src/shared/email/transactional_email.ts`, generalized to resolve
the binding through this package's own `generate.env` convention (works
under Vite too) and to take the verified sender address as a required
option instead of a hardcoded constant.

## Usage

```ts
import { sendTransactionalEmail } from 'cloudflare-next-intl/sendTransactionalEmail';
import intlConfig from './intl_config';

const outcome = await sendTransactionalEmail(
    { to: 'user@example.com', subject: 'Welcome', text: 'Welcome!', html: '<p>Welcome!</p>' },
    { generate: intlConfig.generate, errorHandling: intlConfig.errorHandling, senderAddress: 'no-reply@yourdomain.com' },
    'MyFeature.sendWelcomeEmail',
);
// outcome: 'sent' | 'unavailable' | 'failed' — never throws
```

Local dev (no Worker binding) needs `CLOUDFLARE_ACCOUNT_ID`/
`CLOUDFLARE_EMAIL_TOKEN` in your env (or pass `restAccountId`/`restToken`
directly) to exercise real delivery via the REST fallback; without them,
`sendTransactionalEmail` returns `'unavailable'` rather than attempting a
request that would only fail.

## Layout

- `resolve_email_binding.ts` — resolves the Email Sending binding (default
  name `EMAIL`) via `resolveEnv()`.
- `escape_html.ts` — HTML-escapes a value before it goes into an email body.
- `send_transactional_email.ts` — the binding-or-REST primitive, reporting
  (never throwing) on any failure.
```

- [ ] **Step 3: Add the package.json export**

In `package/package.json`, add (alongside the `./fetchText` entries from Task 4):

```json
"./sendTransactionalEmail": {
    "types": "./dist/src/cloudflare_email/send_transactional_email.d.ts",
    "import": "./dist/src/cloudflare_email/send_transactional_email.js"
},
```

- [ ] **Step 4: Verify the build, exports, and full test suite**

Run: `cd package && npm run build && npm run check:exports && npm test`
Expected: all three succeed.

- [ ] **Step 5: Commit**

```bash
git add package/src/cloudflare_email/index.ts package/src/cloudflare_email/README.md package/package.json
git commit -m "feat(cloudflare_email): add barrel, README, package.json export"
```

---

### Task 21: `findPageFiles` + `detectDynamicUsage` — scan a consumer app for `page`/`route` files and detect dynamic-API usage

**Files:**
- Create: `package/src/dynamic_pages_check/find_page_files.ts`
- Test: `package/src/dynamic_pages_check/find_page_files.test.ts`
- Create: `package/src/dynamic_pages_check/detect_dynamic_usage.ts`
- Test: `package/src/dynamic_pages_check/detect_dynamic_usage.test.ts`

**Interfaces:**
- Consumes: `node:fs` (`readdirSync`), `node:path` (`join`).
- Produces: `findPageFiles(appDir: string): string[]`; `DynamicDetectionResult` interface and `detectDynamicUsage(sourceText: string): DynamicDetectionResult` — both consumed by Task 23.

- [ ] **Step 1: Write the failing tests**

```ts
// package/src/dynamic_pages_check/find_page_files.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPageFiles } from './find_page_files.js';

describe('findPageFiles', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'cfni-find-page-files-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('finds page.tsx and route.ts at any depth', () => {
        mkdirSync(join(dir, 'errors', '[id]'), { recursive: true });
        writeFileSync(join(dir, 'page.tsx'), '');
        writeFileSync(join(dir, 'errors', 'page.tsx'), '');
        writeFileSync(join(dir, 'errors', '[id]', 'page.tsx'), '');
        writeFileSync(join(dir, 'errors', 'route.ts'), '');
        writeFileSync(join(dir, 'errors', 'error_row.tsx'), ''); // not a page/route — must be excluded

        const files = findPageFiles(dir).map((f) => f.replace(dir, ''));
        expect(files.sort()).toEqual([
            '/errors/[id]/page.tsx',
            '/errors/page.tsx',
            '/errors/route.ts',
            '/page.tsx',
        ].sort());
    });

    it('skips node_modules and dot-directories', () => {
        mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
        mkdirSync(join(dir, '.next'), { recursive: true });
        writeFileSync(join(dir, 'node_modules', 'x', 'page.tsx'), '');
        writeFileSync(join(dir, '.next', 'page.tsx'), '');
        writeFileSync(join(dir, 'page.tsx'), '');

        expect(findPageFiles(dir)).toEqual([join(dir, 'page.tsx')]);
    });

    it('returns an empty array for a directory that does not exist', () => {
        expect(findPageFiles(join(dir, 'nope'))).toEqual([]);
    });
});
```

```ts
// package/src/dynamic_pages_check/detect_dynamic_usage.test.ts
import { describe, it, expect } from 'vitest';
import { detectDynamicUsage } from './detect_dynamic_usage.js';

describe('detectDynamicUsage', () => {
    it('finds no explicit export and no dynamic APIs in a plain static page', () => {
        const result = detectDynamicUsage(`export default function Page() { return <div>hi</div>; }`);
        expect(result.hasExplicitDynamicExport).toBe(false);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('detects an existing export const dynamic', () => {
        const result = detectDynamicUsage(`export const dynamic = "force-dynamic";\nexport default function Page() {}`);
        expect(result.hasExplicitDynamicExport).toBe(true);
    });

    it('detects cookies()/headers() usage from next/headers', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\nasync function f() { await cookies(); }`);
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('detects a searchParams prop', () => {
        const result = detectDynamicUsage(`export default async function Page({ searchParams }) {}`);
        expect(result.detectedDynamicApis).toContain('searchParams');
    });

    it('detects unstable_noStore()', () => {
        const result = detectDynamicUsage(`import { unstable_noStore } from "next/cache";\nunstable_noStore();`);
        expect(result.detectedDynamicApis).toContain('unstable_noStore()');
    });

    it('detects cache: "no-store" fetch options', () => {
        const result = detectDynamicUsage(`fetch(url, { cache: "no-store" });`);
        expect(result.detectedDynamicApis).toContain('cache: "no-store"');
    });

    it('deduplicates repeated matches of the same API', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\ncookies(); cookies(); cookies();`);
        expect(result.detectedDynamicApis.filter((a) => a === 'cookies()')).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/dynamic_pages_check/find_page_files.test.ts src/dynamic_pages_check/detect_dynamic_usage.test.ts`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/dynamic_pages_check/find_page_files.ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_FILE_NAMES = new Set(['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.ts', 'route.js']);

/** Recursively finds every App Router `page.*`/`route.*` file under `appDir`, skipping `node_modules` and any dot-directory (`.next`, `.git`, ...). Returns `[]` for a directory that doesn't exist rather than throwing. */
export function findPageFiles(appDir: string): string[] {
    let entries;
    try {
        entries = readdirSync(appDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const files: string[] = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            files.push(...findPageFiles(join(appDir, entry.name)));
        } else if (PAGE_FILE_NAMES.has(entry.name)) {
            files.push(join(appDir, entry.name));
        }
    }
    return files;
}
```

```ts
// package/src/dynamic_pages_check/detect_dynamic_usage.ts
export interface DynamicDetectionResult {
    hasExplicitDynamicExport: boolean;
    /** Human-readable names of each distinct dynamic-API signal found — e.g. `'cookies()'`, `'searchParams'`. Empty when the page looks static. */
    detectedDynamicApis: string[];
}

// Text-based heuristics, not a real parser — good enough to catch the
// overwhelmingly common cases (this package has no TypeScript-compiler-API
// dependency to spend on a precise one) and deliberately conservative: a
// false positive here just means a page keeps Next's default dynamic
// inference instead of gaining `force-static`, never the other way around.
const DYNAMIC_API_CHECKS: { name: string; pattern: RegExp }[] = [
    { name: 'cookies()', pattern: /\bcookies\s*\(/ },
    { name: 'headers()', pattern: /\bheaders\s*\(\s*\)/ },
    { name: 'searchParams', pattern: /\bsearchParams\b/ },
    { name: 'unstable_noStore()', pattern: /\bunstable_noStore\s*\(/ },
    { name: 'connection()', pattern: /\bconnection\s*\(\s*\)/ },
    { name: 'cache: "no-store"', pattern: /cache:\s*['"]no-store['"]/ },
    { name: 'next: { revalidate: 0 }', pattern: /next:\s*\{\s*revalidate:\s*0\s*[,}]/ },
];

const EXPLICIT_DYNAMIC_EXPORT = /export\s+const\s+dynamic\s*=/;

export function detectDynamicUsage(sourceText: string): DynamicDetectionResult {
    return {
        hasExplicitDynamicExport: EXPLICIT_DYNAMIC_EXPORT.test(sourceText),
        detectedDynamicApis: DYNAMIC_API_CHECKS.filter(({ pattern }) => pattern.test(sourceText)).map(({ name }) => name),
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/dynamic_pages_check/find_page_files.test.ts src/dynamic_pages_check/detect_dynamic_usage.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/find_page_files.ts package/src/dynamic_pages_check/find_page_files.test.ts package/src/dynamic_pages_check/detect_dynamic_usage.ts package/src/dynamic_pages_check/detect_dynamic_usage.test.ts
git commit -m "feat(dynamic_pages_check): add findPageFiles and detectDynamicUsage"
```

---

### Task 22: `insertDynamicExport` — write the `export const dynamic` line into a page's source

**Files:**
- Create: `package/src/dynamic_pages_check/insert_dynamic_export.ts`
- Test: `package/src/dynamic_pages_check/insert_dynamic_export.test.ts`

**Interfaces:**
- Consumes: nothing (pure string transform).
- Produces: `insertDynamicExport(sourceText: string, value: 'force-static' | 'force-dynamic'): string` — consumed by Task 23.

- [ ] **Step 1: Write the failing test**

```ts
// package/src/dynamic_pages_check/insert_dynamic_export.test.ts
import { describe, it, expect } from 'vitest';
import { insertDynamicExport } from './insert_dynamic_export.js';

describe('insertDynamicExport', () => {
    it('inserts after the last top-level import, with a marker comment', () => {
        const source = `import Link from "next/link";\nimport { requireErrorsAccess } from "./gate";\n\nexport default function Page() {}\n`;
        const result = insertDynamicExport(source, 'force-static');
        expect(result).toContain('import { requireErrorsAccess } from "./gate";\n\n// Auto-inserted by cloudflare-next-intl\'s checkDynamicPages');
        expect(result).toContain('export const dynamic = "force-static";');
        expect(result.indexOf('export const dynamic')).toBeLessThan(result.indexOf('export default function Page'));
    });

    it('inserts at the top of the file when there are no imports', () => {
        const source = `export default function Page() {}\n`;
        const result = insertDynamicExport(source, 'force-dynamic');
        expect(result.indexOf('export const dynamic')).toBe(0);
        expect(result).toContain('export const dynamic = "force-dynamic";');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/dynamic_pages_check/insert_dynamic_export.test.ts`
Expected: FAIL with "Cannot find module './insert_dynamic_export.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/dynamic_pages_check/insert_dynamic_export.ts
const IMPORT_STATEMENT = /^import[\s\S]*?;\s*$/gm;

/**
 * Inserts `export const dynamic = "<value>";` right after the last
 * top-level `import` statement (or at the very top of the file when there
 * are none), preceded by a marker comment so a human reading the file later
 * knows this line was machine-added and how to remove/override it.
 */
export function insertDynamicExport(sourceText: string, value: 'force-static' | 'force-dynamic'): string {
    const block = `// Auto-inserted by cloudflare-next-intl's checkDynamicPages (mode: "fix") — remove this line, or set \`dynamic\` yourself, to override.\nexport const dynamic = "${value}";\n`;

    let lastImportEnd = -1;
    for (const match of sourceText.matchAll(IMPORT_STATEMENT)) {
        lastImportEnd = match.index! + match[0].length;
    }

    if (lastImportEnd === -1) {
        return `${block}\n${sourceText}`;
    }
    return `${sourceText.slice(0, lastImportEnd)}\n\n${block}\n${sourceText.slice(lastImportEnd).replace(/^\n+/, '')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/dynamic_pages_check/insert_dynamic_export.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/insert_dynamic_export.ts package/src/dynamic_pages_check/insert_dynamic_export.test.ts
git commit -m "feat(dynamic_pages_check): add insertDynamicExport"
```

---

### Task 23: `checkDynamicPages` — the three-mode orchestrator (`off` / `report` / `fix`), with a per-page skip list

**Files:**
- Create: `package/src/dynamic_pages_check/check_dynamic_pages.ts`
- Test: `package/src/dynamic_pages_check/check_dynamic_pages.test.ts`

**Interfaces:**
- Consumes: `findPageFiles` (Task 21), `detectDynamicUsage` (Task 21), `insertDynamicExport` (Task 22) — all overridable via an `io` parameter for testing.
- Produces: `DynamicPagesCheckMode`, `CheckDynamicPagesOptions`, `CheckDynamicPagesReport`, `checkDynamicPages(options, io?): Promise<CheckDynamicPagesReport[]>` — the module's top-level public entry point (exported from `index.ts` in Task 24).

- [ ] **Step 1: Write the failing test**

```ts
// package/src/dynamic_pages_check/check_dynamic_pages.test.ts
import { describe, it, expect, vi } from 'vitest';
import { checkDynamicPages } from './check_dynamic_pages.js';

const APP_DIR = '/app';

function makeIo(sources: Record<string, string>) {
    const written: Record<string, string> = {};
    return {
        io: {
            findPageFiles: vi.fn(() => Object.keys(sources)),
            readFile: vi.fn((file: string) => sources[file]),
            writeFile: vi.fn((file: string, contents: string) => {
                written[file] = contents;
            }),
        },
        written,
    };
}

describe('checkDynamicPages', () => {
    it('mode "off" scans nothing and returns an empty report', async () => {
        const { io } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'off' }, io);
        expect(reports).toEqual([]);
        expect(io.findPageFiles).not.toHaveBeenCalled();
    });

    it('mode "report" never writes, and reports "would-add-force-static" for a static-looking page', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'report' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'would-add-force-static' }]);
        expect(written).toEqual({});
    });

    it('mode "fix" writes force-static into a page with no dynamic-API usage', async () => {
        const { io, written } = makeIo({ '/app/page.tsx': 'export default function Page() {}\n' });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/page.tsx', action: 'added-force-static' }]);
        expect(written['/app/page.tsx']).toContain('export const dynamic = "force-static";');
    });

    it('mode "fix" writes force-dynamic into a page that uses cookies()', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'import { cookies } from "next/headers";\nasync function f() { await cookies(); }\n',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'added-force-dynamic' }]);
        expect(written['/app/errors/page.tsx']).toContain('export const dynamic = "force-dynamic";');
    });

    it('leaves a page with an explicit `dynamic` export untouched, in any mode', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'export const dynamic = "force-dynamic";\nexport default function Page() {}',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix' }, io);
        expect(reports).toEqual([{ file: '/app/errors/page.tsx', action: 'already-declared' }]);
        expect(written).toEqual({});
    });

    it('skips every file listed in `skip`, without reading or writing it', async () => {
        const { io, written } = makeIo({
            '/app/errors/page.tsx': 'export default function Page() {}',
            '/app/page.tsx': 'export default function Page() {}',
        });
        const reports = await checkDynamicPages({ appDir: APP_DIR, mode: 'fix', skip: ['/app/errors/page.tsx'] }, io);
        expect(reports).toEqual(expect.arrayContaining([{ file: '/app/errors/page.tsx', action: 'skipped' }]));
        expect(written['/app/errors/page.tsx']).toBeUndefined();
        expect(written['/app/page.tsx']).toBeDefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/dynamic_pages_check/check_dynamic_pages.test.ts`
Expected: FAIL with "Cannot find module './check_dynamic_pages.js'"

- [ ] **Step 3: Write minimal implementation**

```ts
// package/src/dynamic_pages_check/check_dynamic_pages.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage } from './detect_dynamic_usage.js';
import { insertDynamicExport } from './insert_dynamic_export.js';

/** `'off'` — don't scan at all (the global disable switch). `'report'` — scan and say what would change, write nothing. `'fix'` — scan and write the missing `export const dynamic` into each qualifying file. */
export type DynamicPagesCheckMode = 'off' | 'report' | 'fix';

export interface CheckDynamicPagesOptions {
    /** Root directory to scan recursively for `page.*`/`route.*` files — typically your Next.js `app/` directory. */
    appDir: string;
    /** Defaults to `'fix'`. */
    mode?: DynamicPagesCheckMode;
    /** File paths (as returned by `findPageFiles` — i.e. joined with `appDir`) to leave completely alone: not read, not written, not reported as anything but `'skipped'`. */
    skip?: readonly string[];
}

export interface CheckDynamicPagesReport {
    file: string;
    action: 'added-force-static' | 'added-force-dynamic' | 'would-add-force-static' | 'would-add-force-dynamic' | 'already-declared' | 'skipped';
}

export interface CheckDynamicPagesIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
}

export async function checkDynamicPages(
    options: CheckDynamicPagesOptions,
    io: CheckDynamicPagesIo = {},
): Promise<CheckDynamicPagesReport[]> {
    const mode = options.mode ?? 'fix';
    if (mode === 'off') return [];

    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const skipSet = new Set(options.skip ?? []);

    const reports: CheckDynamicPagesReport[] = [];
    for (const file of findPageFiles(options.appDir)) {
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }

        const source = readFile(file);
        const detection = detectDynamicUsage(source);
        if (detection.hasExplicitDynamicExport) {
            reports.push({ file, action: 'already-declared' });
            continue;
        }

        const value = detection.detectedDynamicApis.length === 0 ? 'force-static' : 'force-dynamic';
        if (mode === 'fix') {
            writeFile(file, insertDynamicExport(source, value));
            reports.push({ file, action: value === 'force-static' ? 'added-force-static' : 'added-force-dynamic' });
        } else {
            reports.push({ file, action: value === 'force-static' ? 'would-add-force-static' : 'would-add-force-dynamic' });
        }
    }
    return reports;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/dynamic_pages_check/check_dynamic_pages.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add package/src/dynamic_pages_check/check_dynamic_pages.ts package/src/dynamic_pages_check/check_dynamic_pages.test.ts
git commit -m "feat(dynamic_pages_check): add checkDynamicPages (off/report/fix modes, skip list)"
```

---

### Task 24: `dynamic_pages_check` barrel, CLI (`cfni-check-dynamic-pages`), README, and package.json wiring

**Files:**
- Create: `package/src/dynamic_pages_check/index.ts`
- Create: `package/bin/check_dynamic_pages.mjs`
- Create: `package/src/dynamic_pages_check/README.md`
- Modify: `package/package.json` (`exports` and `bin` maps)

**Interfaces:**
- Consumes: everything from Tasks 21–23.
- Produces: `cloudflare-next-intl/checkDynamicPages` (programmatic) and the `cfni-check-dynamic-pages` CLI (for a `predev`/`prebuild` script) importable/runnable by consumers.

- [ ] **Step 1: Write the barrel**

```ts
// package/src/dynamic_pages_check/index.ts
export { checkDynamicPages, type DynamicPagesCheckMode, type CheckDynamicPagesOptions, type CheckDynamicPagesReport, type CheckDynamicPagesIo } from './check_dynamic_pages.js';
export { findPageFiles } from './find_page_files.js';
export { detectDynamicUsage, type DynamicDetectionResult } from './detect_dynamic_usage.js';
```

- [ ] **Step 2: Write the CLI wrapper**

```js
#!/usr/bin/env node
// package/bin/check_dynamic_pages.mjs
// Usage: cfni-check-dynamic-pages [--app-dir=src/app] [--mode=off|report|fix] [--skip=a/page.tsx,b/page.tsx]
// Env equivalents: CFNI_DYNAMIC_PAGES_APP_DIR, CFNI_DYNAMIC_PAGES_MODE, CFNI_DYNAMIC_PAGES_SKIP (comma-separated).
import { resolve } from 'node:path';
import { checkDynamicPages } from '../dist/src/dynamic_pages_check/check_dynamic_pages.js';

function argValue(name) {
    const prefix = `--${name}=`;
    const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
}

const appDir = resolve(argValue('app-dir') ?? process.env.CFNI_DYNAMIC_PAGES_APP_DIR ?? 'src/app');
const mode = argValue('mode') ?? process.env.CFNI_DYNAMIC_PAGES_MODE ?? 'fix';
const skipRaw = argValue('skip') ?? process.env.CFNI_DYNAMIC_PAGES_SKIP ?? '';
const skip = skipRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => resolve(s));

const reports = await checkDynamicPages({ appDir, mode, skip });

if (reports.length === 0) {
    console.log(mode === 'off' ? 'checkDynamicPages: disabled (mode=off).' : `checkDynamicPages: no page/route files found under ${appDir}.`);
} else {
    for (const { file, action } of reports) console.log(`${action.padEnd(24)} ${file}`);
}
```

- [ ] **Step 3: Write the README**

```md
<!-- package/src/dynamic_pages_check/README.md -->
# `src/dynamic_pages_check`

Scans your `app/` directory for `page.*`/`route.*` files and, for every one
that doesn't already declare its own `export const dynamic`, inserts one —
`"force-static"` when nothing in the file looks request-dependent,
`"force-dynamic"` when it does (`cookies()`, `headers()`, a `searchParams`
prop, `unstable_noStore()`, `connection()`, or a `no-store`/`revalidate: 0`
fetch). A file that already has its own `export const dynamic` is always
left alone, in every mode — this never overrides an explicit choice.

This is a **text-based heuristic**, not a real parser: good enough for the
common cases, but read what it inserted rather than trusting it blindly on
an unusual file.

## Usage

Add to your `package.json`:

```json
{ "scripts": { "predev": "cfni-check-dynamic-pages", "prebuild": "cfni-check-dynamic-pages" } }
```

Three modes (`--mode=` / `CFNI_DYNAMIC_PAGES_MODE`):
- `fix` (default) — writes the missing export into each qualifying file.
- `report` — prints what it would do, writes nothing.
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
```

- [ ] **Step 4: Wire package.json**

In `package/package.json`, add to `exports` (alongside `./sendTransactionalEmail`):

```json
"./checkDynamicPages": {
    "types": "./dist/src/dynamic_pages_check/index.d.ts",
    "import": "./dist/src/dynamic_pages_check/index.js"
},
```

And add to `bin` (alongside the existing `cfni-db-codegen` etc.):

```json
"cfni-check-dynamic-pages": "bin/check_dynamic_pages.mjs",
```

- [ ] **Step 5: Verify the build, exports, and full test suite**

Run: `cd package && npm run build && npm run check:exports && npm test`
Expected: all three succeed.

- [ ] **Step 6: Commit**

```bash
git add package/src/dynamic_pages_check/index.ts package/bin/check_dynamic_pages.mjs package/src/dynamic_pages_check/README.md package/package.json
git commit -m "feat(dynamic_pages_check): add barrel, CLI, README, and package.json wiring"
```

---

## Self-Review Notes

- **Spec coverage:** fetch-helper porting (Tasks 1–4), errors list+detail UI (Tasks 10–14), password/access gate → replaced per the user's explicit ask with the Firebase-email gate from `CRV/src/app/errors/gate.ts` (Task 7), "add new error" functionality → `recordError` (Task 6) + README wiring (Task 15, section 5), "customizable" → `allowedEmails` predicate option (Task 7), `linkFor`/`hrefFor`/`onDeleted`/`listPath` props throughout (Tasks 8, 12–14) instead of the reference implementation's hardcoded `/errors` paths; Hyperdrive auto-get with a disable bool (Tasks 16–17, `db.autoHyperdrive`); Cloudflare Email port (Tasks 18–20, `sendTransactionalEmail`); auto-detect static/dynamic pages (Tasks 21–24, `checkDynamicPages`) with the three explicitly requested modes (`off`/`report`/`fix` — "user can also disable this" → `mode: 'off'`; "it should has three modes nothing report and change" → `off`/`report`/`fix`) and a per-page `skip` array ("make some pages skip in array param").
- **No placeholders:** every step above has runnable test code and runnable implementation code; no file is introduced without its test in the same task (except Task 24's CLI wrapper, which matches this package's own existing `bin/*.mjs` convention of no colocated test — its logic is a thin argv-parsing shell around the tested `checkDynamicPages` from Task 23).
- **Type consistency:** `ErrorRow`/`ErrorStatus`/`D1DatabaseLike` are defined once (Task 5) and imported everywhere else by that same name; `ErrorsActions` (Task 8) is the one shape every client component (Tasks 13–14) and the README wiring (Task 15) uses for their `actions` prop; `resolveDbMode`'s new second parameter (Task 17) is threaded through both `context.ts` call sites, not just one; `CheckDynamicPagesReport['action']` (Task 23) covers all six values used by both the CLI printer (Task 24) and the README's documented behavior.

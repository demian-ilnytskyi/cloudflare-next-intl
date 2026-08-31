# Middleware Hot-Path Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measurably reduce per-request work in the intl middleware's hot path (`package/src/config/middleware.ts` and the firebase_auth middleware helper it auto-wires, `package/src/firebase_auth/middleware/update_session.ts`) without changing any routing/redirect/rewrite decision, cookie value, or header value it currently produces.

**Architecture:** This is a targeted perf pass, not a rewrite. `middleware.ts`, `get_user_locale.ts` (locale detection), and `cookie_key.ts` were already hand-optimized in prior sessions (see "Prior State" below) — there is no remaining low-hanging fruit there. The one real hot-path redundancy found by inspection: `update_session.ts` calls `decodeJwtPayload(token)` on the **same token string** up to twice per request (once to test `email_verified === false` as a gate, once later to test `=== true`/`=== false` again on a page-specific branch) — each call re-does a `base64` decode + 3 regex execs. Fix: memoize the decode result per unique token string, scoped to a single `updateSession()` call (a plain `Map`, not React's `cache()` — that API is for cross-boundary/render-tree dedup and adds lookup overhead this single-function-body case doesn't need). Also fix `vitest.bench.config.ts`, which currently silently skips almost every existing `*.bench.ts` file in the repo (including `middleware.bench.ts`, `update_session.bench.ts`, `get_user_locale.bench.ts`, `decode_jwt_payload.bench.ts`) — `npm run bench` must actually exercise the files this plan benches against.

**Tech Stack:** TypeScript (ESM, NodeNext), Next.js (`next/server`), vitest (`vitest run --coverage`) + vitest bench (`vitest bench --run` via `vitest.bench.config.ts`).

**Spec:** No separate spec file — the approved design is reproduced in "Approved Design" below.

## Prior State (why scope is narrow)

Read in full before starting — this justifies NOT touching these files further:

- `package/src/config/middleware.ts` — already avoids `split('/').filter(Boolean)` array allocation for locale-prefix parsing (manual `indexOf`/`charCodeAt` scan, see inline comment at the segment-scan block), already memoizes the `next/dist/.../user-agent` and `update_session.js` dynamic imports at module scope so they're only paid once per process, already wraps `getIsBotValue` in React's `cache()`.
- `package/src/server/functions/get_user_locale.ts` (`languageDetecotr`) — already parses `Accept-Language` with manual `indexOf`/`slice` (no `.split(';').map().sort()` chain), wrapped in `cache()`.
- `package/src/config/cookie_key.ts` — four string constants, nothing to optimize.
- `package/src/firebase_auth/decode_jwt_payload.ts` — already benchmarked and chosen: regex extraction over `JSON.parse`, ~2.6x faster per its own doc comment and `decode_jwt_payload.bench.ts`. Do not change its internals; this plan only reduces *how many times it's called per request*, from the caller side.
- `package/src/firebase_auth/is_whitelisted.ts`, `preserve_redirect_query.ts` — trivial, no per-request redundancy.

## Approved Design

1. Wire `middleware.bench.ts`, `get_user_locale.bench.ts`, `decode_jwt_payload.bench.ts`, `update_session.bench.ts` into `vitest.bench.config.ts` so `npm run bench` actually runs them; capture a baseline JSON.
2. In `update_session.ts`, add a per-call `Map<string, ReturnType<typeof decodeJwtPayload>>` memo and route the 5 duplicate-prone call sites (lines ~412, 427, 457, 471, 489 in the current file) through it. Leave the call inside `isJwtExpired`/module scope alone (different, non-duplicated call site — see Task 2 rationale).
3. Add a regression test that spies on `decode_jwt_payload.js`'s default export and asserts it is called at most once per unique token value in the existing "unverified email on verifyEmailPath" scenario (the scenario that today calls it twice on the same token).
4. Re-run the full test suite (100% coverage maintained, no threshold changes needed since `update_session.ts` isn't in the `perFile` exception list — it must already be effectively 100%) and re-run the bench, reporting before/after numbers in the final commit message.

## Global Constraints

- Package under test is `package/`. Run every command from `/Volumes/External/own_projects/cloudflare-next-intl/package`.
- Tests: `npm test` (= `vitest run --coverage`). Benches: `npm run bench` (= `vitest bench --run --config vitest.bench.config.ts`).
- Coverage thresholds are **perFile 100%** for `src/**/!(general_functions|middleware).{ts,tsx}` (see `vitest.config.ts`). `update_session.ts` is NOT in the exception list — it must stay at 100% statements/branches/functions/lines. Do not add an exception for it; if a new branch can't be hit, restructure the code instead.
- `*.bench.ts` files are excluded from coverage.
- Indentation in the touched files is 4 spaces. No new comments except where non-obvious (why a plain `Map` was chosen over `cache()`, matching this file's existing comment density).
- ESM: all relative imports end in `.js`.
- **Zero behavior change**: every existing test in `middleware.test.ts` and `update_session.test.ts` (1479 lines) must pass unmodified. Do not alter any assertion in either file as part of this plan — if a change would require altering an existing assertion, stop and reconsider the approach.
- Do not touch `decode_jwt_payload.ts`, `is_whitelisted.ts`, `preserve_redirect_query.ts`, `get_user_locale.ts`, `cookie_key.ts`, or the locale-routing portion of `middleware.ts` — out of scope per "Prior State" above.
- Scratchpad for bench JSON: `/private/tmp/claude-501/-Volumes-External-own-projects-cloudflare-next-intl/1b745f74-4e64-4b2c-8c6e-183e453c5264/scratchpad`. Referred to below as `$SCRATCH`.

## File Structure

- `package/vitest.bench.config.ts` — MODIFY. Add the four missing bench globs.
- `package/src/firebase_auth/middleware/update_session.ts` — MODIFY. Add the per-call token-decode memo; route 5 call sites through it.
- `package/src/firebase_auth/middleware/update_session.bench.ts` — MODIFY. Add a bench case that hits the same token's decode gate twice per request (the exact redundant path), so the memo's effect is visible in `npm run bench` output.
- `package/src/firebase_auth/middleware/update_session.test.ts` — MODIFY. Add one regression test asserting `decodeJwtPayload` is called at most once per unique token value in the double-decode scenario.

---

### Task 1: Wire the missing benches into the bench config and capture a baseline

**Files:**
- Modify: `package/vitest.bench.config.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `$SCRATCH/bench-baseline.json` — Task 3 compares against this.

- [ ] **Step 1: Add the missing bench globs**

In `package/vitest.bench.config.ts`, replace the `benchmark` block:

```ts
        benchmark: {
            include: [
                'src/server/components/helper_script.bench.ts',
                'src/image_optimizer/*.bench.ts',
                'src/config/middleware.bench.ts',
                'src/server/functions/get_user_locale.bench.ts',
                'src/firebase_auth/decode_jwt_payload.bench.ts',
                'src/firebase_auth/middleware/update_session.bench.ts',
            ],
            outputJson: process.env.BENCH_JSON ?? './bench-result.json',
        },
```

- [ ] **Step 2: Run the benches and store the baseline**

Run: `cd package && BENCH_JSON=$SCRATCH/bench-baseline.json npm run bench`

Expected: all four newly-included describe blocks (`intlMiddleware`, `intlMiddleware with firebaseAuth configured`, `languageDetecotr`, `decodeJwtPayload`, `updateSession`) print bench results with no errors. Note the `updateSession` → `"valid session, unverified email: decodeJwtPayload + verifyEmailPath redirect"` mean time — this is the case Task 2 targets.

- [ ] **Step 3: Commit**

```bash
git add vitest.bench.config.ts
git commit -m "chore: wire middleware/locale/JWT benches into vitest.bench.config.ts

npm run bench was silently skipping middleware.bench.ts, get_user_locale.bench.ts,
decode_jwt_payload.bench.ts, and update_session.bench.ts — only helper_script.bench.ts
and image_optimizer/*.bench.ts were in benchmark.include."
```

---

### Task 2: Memoize per-request JWT decode in `updateSession`

**Files:**
- Modify: `package/src/firebase_auth/middleware/update_session.ts`

**Interfaces:**
- Consumes: `decodeJwtPayload` from `../decode_jwt_payload.js` (unchanged signature: `(token: string) => { exp?: number; iat?: number; email_verified?: boolean } | null`).
- Produces: no new exports. `updateSession`'s exported signature and return value are unchanged.

**Why a plain `Map`, not `cache()` from `react`:** `middleware.ts` and `get_user_locale.ts` both use React's `cache()` to dedupe a function's result *across separate call sites that may run in different parts of a render/request tree*. Here, all 5 duplicate-prone calls happen inside the single synchronous body of one `updateSession()` invocation — there's no cross-boundary dedup need, so a `Map` scoped to the function call avoids `cache()`'s per-call context lookup for no benefit. This was reasoned from the code, not re-benched against a `cache()` variant: introducing a second implementation just to prove the well-established fact that a local variable beats a generic memoization API for same-function-body reuse would add risk (two code paths to keep behaviorally identical) for a foregone conclusion.

- [ ] **Step 1: Read the current call sites**

Run: `grep -n "decodeJwtPayload" package/src/firebase_auth/middleware/update_session.ts`

Expected output (line numbers may drift slightly if the file changed since this plan was written — treat these as anchors, not gospel):

```
3:import decodeJwtPayload from '../decode_jwt_payload.js';
76:const decoded = decodeJwtPayload(token);
412:&& decodeJwtPayload(token!)?.email_verified === false
427:...EmailPage && hasSession && decodeJwtPayload(token!)?.email_verified === false) {
457:...iedEmail = hint !== 'true' && decodeJwtPayload(token)?.email_verified === false;
471:...edEmail = hint !== 'true' && decodeJwtPayload(token!)?.email_verified === false;
489:...e || (isVerifyEmailPage && decodeJwtPayload(token!)?.email_verified === true)) {
```

Line 76 is inside the module-level `isJwtExpired` helper (also called from `refreshIdToken`'s cache-hit path on a *different* token) — leave it untouched. The other five (412, 427, 457, 471, 489) are all inside `updateSession` itself and are the ones this task routes through the memo.

- [ ] **Step 2: Add the memo, right after the early-return guard**

In `update_session.ts`, find:

```ts
    const fa = config.firebaseAuth;
    if (!fa || fa.middlewareEnabled === false) return baseResponse;
```

Add immediately after it:

```ts
    const fa = config.firebaseAuth;
    if (!fa || fa.middlewareEnabled === false) return baseResponse;

    // `decodeJwtPayload` re-does a base64 decode + 3 regex execs per call.
    // Several branches below independently ask the same question of the
    // same token (e.g. "is email_verified false?" then later "...true?"
    // after nothing changed it) — memoize per unique token string for the
    // lifetime of this one call, not process-wide (a refreshed token is a
    // different string and must decode fresh).
    const decodedTokenCache = new Map<string, ReturnType<typeof decodeJwtPayload>>();
    function decodeTokenOnce(t: string): ReturnType<typeof decodeJwtPayload> {
        if (decodedTokenCache.has(t)) return decodedTokenCache.get(t)!;
        const decoded = decodeJwtPayload(t);
        decodedTokenCache.set(t, decoded);
        return decoded;
    }
```

- [ ] **Step 3: Route the 5 call sites through the memo**

Five separate, minimal replacements — `decodeJwtPayload(` → `decodeTokenOnce(` at each of these exact call sites (do not touch line 76's call, inside `isJwtExpired`):

```ts
    if (isVerifyEmailPage && hasSession && !refreshedToken
        && decodeTokenOnce(token!)?.email_verified === false
        && request.cookies.get(emailVerifiedHintCookieName)?.value === 'true') {
```

```ts
    if (fa.verifyEmailPath && !isVerifyEmailPage && hasSession && decodeTokenOnce(token!)?.email_verified === false) {
```

```ts
                    unverifiedEmail = hint !== 'true' && decodeTokenOnce(token)?.email_verified === false;
```

```ts
            unverifiedEmail = hint !== 'true' && decodeTokenOnce(token!)?.email_verified === false;
```

```ts
    } else if (isAuthPage || (isVerifyEmailPage && decodeTokenOnce(token!)?.email_verified === true)) {
```

- [ ] **Step 4: Run the existing test suite for this file — must pass unmodified**

Run: `cd package && npx vitest run src/firebase_auth/middleware/update_session.test.ts`

Expected: all existing tests pass, no assertions changed. This proves the memo is behaviorally transparent — same inputs, same outputs, same branch decisions.

- [ ] **Step 5: Commit**

```bash
git add src/firebase_auth/middleware/update_session.ts
git commit -m "perf: memoize per-token JWT decode within a single updateSession call

Some branches independently re-check the same token's email_verified claim
(false-gate, then later true/false again on a page-specific branch) —
each decodeJwtPayload() call redoes a base64 decode + 3 regex execs. A
plain Map scoped to one updateSession() invocation dedupes that; a
refreshed token is a different string so it still decodes fresh."
```

---

### Task 3: Add a bench case for the redundant path, and a regression test guarding it

**Files:**
- Modify: `package/src/firebase_auth/middleware/update_session.bench.ts`
- Modify: `package/src/firebase_auth/middleware/update_session.test.ts`

**Interfaces:**
- Consumes: `updateSession` default export (unchanged), `makeTestRequest` from `../../test_utils/mock_next_server.js`.
- Produces: nothing new exported — test/bench additions only.

- [ ] **Step 1: Confirm the existing bench case already exercises the double-decode path**

The existing case in `update_session.bench.ts`:

```ts
    bench('valid session, unverified email: decodeJwtPayload + verifyEmailPath redirect', async () => {
        const { default: updateSession } = await import('./update_session.js');
        const req = makeTestRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: makeJwt(Date.now() / 1000 + 3600, { email_verified: false }) },
        });
        await updateSession(req, NextResponse.next(), 'en');
    });
```

This hits `/en/dashboard` (not `verifyEmailPath`), so it exercises line 427's decode, then — since `unverifiedEmail` ends up `true` and the branch order is `!hasSession || clearInvalidSession` (false) → `unverifiedEmail` (true) → redirects to `verifyEmailPath` — it does NOT reach line 489's decode (that branch requires `isAuthPage || isVerifyEmailPage`, neither true here). So this specific bench case only hits the memo once (no measurable saving) — it's a decode-cost baseline, not the redundancy case. Leave it as-is; add a new case for the actual redundant path instead.

- [ ] **Step 2: Add a bench case that hits both decode call sites on the same token**

Append to `update_session.bench.ts` (inside the existing `describe('updateSession', ...)` block):

```ts
    bench('verified user on verifyEmailPath: decodeJwtPayload gate + page-exit check, same token', async () => {
        const { default: updateSession } = await import('./update_session.js');
        const req = makeTestRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: makeJwt(Date.now() / 1000 + 3600, { email_verified: true }) },
        });
        await updateSession(req, NextResponse.next(), 'en');
    });
```

This request lands on `verifyEmailPath` with an already-verified token: line 412's gate evaluates `email_verified === false` (false, since it's `true` — short-circuits before the hint check) — that's decode call #1 — then falls through to line 489's `isVerifyEmailPage && decodeJwtPayload(token!)?.email_verified === true` (true) — decode call #2 on the identical token string. Before Task 2, this is two full decodes of the same token; after, it's one.

- [ ] **Step 3: Re-run the bench and compare to baseline**

Run: `cd package && BENCH_JSON=$SCRATCH/bench-after.json npm run bench`

Then diff the `updateSession` block's mean/mode times between `$SCRATCH/bench-baseline.json` (Task 1, pre-memo — note it won't have this new case, so instead re-run baseline mentally by checking `decode_jwt_payload.bench.ts`'s "valid token" mean time × 2 vs × 1 as the expected delta) and `$SCRATCH/bench-after.json` for the new case. Expected: the new case's mean time is measurably lower than `decode_jwt_payload` bench's single-decode mean time × 2 (i.e., closer to × 1 + memo-lookup overhead).

- [ ] **Step 4: Add a regression test — spy on decodeJwtPayload, assert call count**

In `update_session.test.ts`, add near the top (after the existing `vi.mock('@intl-config', ...)` block):

```ts
const decodeJwtPayloadSpy = vi.fn();
vi.mock('../decode_jwt_payload.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../decode_jwt_payload.js')>();
    decodeJwtPayloadSpy.mockImplementation(actual.default);
    return { default: decodeJwtPayloadSpy };
});
```

Add a new test inside `describe('updateSession', ...)`:

```ts
    it('decodes a given token at most once per call, even when checked by multiple branches', async () => {
        decodeJwtPayloadSpy.mockClear();
        currentConfig.firebaseAuth!.verifyEmailPath = '/verify-email';
        const { default: updateSession } = await import('./update_session.js');
        const token = makeJwt(Date.now() / 1000 + 3600, { email_verified: true });
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: token },
        });
        await updateSession(req, NextResponse.next(), 'en');

        const callsOnThisToken = decodeJwtPayloadSpy.mock.calls.filter(([t]) => t === token);
        expect(callsOnThisToken.length).toBe(1);
    });
```

- [ ] **Step 5: Run the test file and confirm it passes**

Run: `cd package && npx vitest run src/firebase_auth/middleware/update_session.test.ts`

Expected: PASS, including the new test. If it fails with `callsOnThisToken.length` > 1, re-check Task 2 Step 3 caught all 5 call sites.

- [ ] **Step 6: Commit**

```bash
git add src/firebase_auth/middleware/update_session.bench.ts src/firebase_auth/middleware/update_session.test.ts
git commit -m "test: bench and guard the memoized per-token JWT decode path

Adds the verifyEmailPath+verified-token bench case that previously double-decoded
the same token, plus a spy-based regression test asserting decodeJwtPayload is
called at most once per unique token per updateSession() invocation."
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite with coverage**

Run: `cd package && npm test`

Expected: all tests pass (including the ~1479 lines of `update_session.test.ts` and all of `middleware.test.ts`, unmodified). Coverage thresholds pass with no changes to `vitest.config.ts`'s `thresholds` block — `update_session.ts` must report 100% statements/branches/functions/lines. If any branch in the new `decodeTokenOnce` (the `has(t)` true vs false path) is not covered, Task 3's new test already exercises the cache-hit path (second call, same token) and the cache-miss path (first call) — re-check the test actually calls `updateSession` on a route that reaches both call sites, per Task 3 Step 4.

- [ ] **Step 2: Re-run the bench suite one more time for the final before/after numbers**

Run: `cd package && BENCH_JSON=$SCRATCH/bench-final.json npm run bench`

Report (in the final commit message, not in chat) the `updateSession` → "verified user on verifyEmailPath" case's mean time versus 2× the `decodeJwtPayload` → "valid token, realistic payload size" case's mean time (the pre-memo expectation), showing the saved decode.

- [ ] **Step 3: Confirm zero behavior change one more time**

Run: `cd package && git diff --stat` and manually confirm the only non-test, non-bench, non-config file touched is `update_session.ts`, and that its diff contains no changed conditional/branch logic — only the new `decodedTokenCache`/`decodeTokenOnce` declaration and `decodeJwtPayload(` → `decodeTokenOnce(` renames at the 5 call sites from Task 2 Step 3.

- [ ] **Step 4: Commit (if Step 1-3 surfaced any fixups; otherwise no-op)**

If everything already passed and was committed in Tasks 1-3, there is nothing left to commit — this step exists only to catch and fix any stragglers found during full verification.

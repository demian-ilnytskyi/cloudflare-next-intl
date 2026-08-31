# Firebase Auth Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `package/src/firebase_auth`'s hot paths (JWT decode, the `is_whitelisted`/middleware request path, session cookie handling) measurably faster with `*.bench.ts` evidence, without changing any observable behavior — full test suite green, 100% per-file coverage maintained, no public API changes.

**Architecture:** This module is already heavily perf-tuned (regex-based JWT decode instead of `JSON.parse`, an Edge-cache memoized token refresh, cached Firebase app/module init via `cache()` and module-scope promises). The remaining real wins are narrower than `image_optimizer`'s: (1) `middleware/update_session.ts` calls `decodeJwtPayload` on the **same session token 2-3 times** in one middleware invocation (once for expiry, again for `email_verified`, sometimes a third time on `verifyEmailPath`) — a request-scoped memoization removes the redundant decodes; (2) `is_whitelisted.ts` allocates a new `` `${entry}/` `` string per whitelist entry checked, on **every** request whose path isn't an exact whitelist hit (i.e. most requests) — replacing that with an allocation-free `startsWith` + boundary-char check removes it; (3) `decode_jwt_payload.ts`'s base64 extraction can skip scanning the trailing signature segment and the per-character-class regex callback — bench-gated, adopt only if it measures faster. `require_config.ts`, `firebase_auth_error_helper.ts` (already an O(1) object-lookup + existing cache-variable memoization) and `server/firebase_server.ts` (already promise-cached module imports + a single shared base app) are read but not touched — no genuine remaining win was found there.

**Tech Stack:** TypeScript (ESM, NodeNext), vitest (`vitest run --coverage`) + vitest bench (`vitest bench --run` via `vitest.bench.config.ts`), Next.js `NextRequest`/`NextResponse` mocked via `test_utils/mock_next_server.ts`.

**Spec:** No separate spec file — the approved design is reproduced below, mirroring `docs/superpowers/plans/2026-08-30-image-optimizer-perf.md`'s process for this module.

## Approved Design

1. Baseline: add the one missing bench file (`is_whitelisted.bench.ts`) and two new `update_session.bench.ts` cases that expose the redundant-decode hot paths; run `npm run bench`, save JSON.
2. `is_whitelisted.ts`: replace `path.startsWith(`${entry}/`)` with an allocation-free `path.startsWith(entry) && path.charCodeAt(entry.length) === 47`. Provably behavior-identical (new unit tests pin the boundary cases); always adopted.
3. `decode_jwt_payload.ts`: replace `token.split('.')[1]` with `token.split('.', 2)[1]` and the single regex-callback `.replace(/[-_]/g, fn)` with two plain `.replace(/-/g,'+').replace(/_/g,'/')` calls. Bench-gated: adopt only if the bench shows a real improvement; the existing test suite (which already asserts null-on-malformed-token behavior) proves equivalence either way.
4. `middleware/update_session.ts`: add a request-scoped memoized `decode()` wrapper around `decodeJwtPayload`, use it for every in-function decode (including the expiry check, refactored out of `isJwtExpired` into a small `isTokenExpired(decoded)` helper so `isJwtExpired`/`isIdTokenExpired`'s external behavior is unchanged). TDD via a `vi.spyOn` call-count test. Always adopted (pure redundant-work removal, no behavior change possible).
5. Final verify: full test suite, coverage, bench comparison, changelog, version bump.

## Global Constraints

- Package under test is `package/`. Run every command from `/Volumes/External/own_projects/cloudflare-next-intl/package`.
- Tests: `npm test` (= `vitest run --coverage`). Benches: `npm run bench` (= `vitest bench --run --config vitest.bench.config.ts`).
- Coverage thresholds are **perFile 100%** for `src/**/!(general_functions|middleware).{ts,tsx}` (this exception matches files literally named `general_functions.ts`/`middleware.ts` — `firebase_auth/middleware/update_session.ts` is NOT excepted and must stay at 100%). `*.bench.ts` files and `src/test_utils/**` are excluded from coverage.
- ESM: all relative imports end in `.js`.
- No new runtime dependencies. No public API changes — every touched function keeps its existing exported signature.
- Indentation matches the surrounding file (4 spaces throughout `firebase_auth/**`). No new comments except where non-obvious behavior needs one line of "why", matching this module's existing style.
- Scratchpad for bench JSON: `/private/tmp/claude-501/-Volumes-External-own-projects-cloudflare-next-intl/8e8e5fd1-6f23-4ada-8fe8-ed8ea90a79ec/scratchpad`. Referred to below as `$SCRATCH`.

## File Structure

- `package/src/firebase_auth/is_whitelisted.bench.ts` — CREATE. Was missing; benches the whitelist scan across list sizes.
- `package/src/firebase_auth/is_whitelisted.ts` — MODIFY. Allocation-free prefix check.
- `package/src/firebase_auth/is_whitelisted.test.ts` — MODIFY. Pin the new boundary-check behavior.
- `package/src/firebase_auth/decode_jwt_payload.ts` — MODIFY (conditionally, per bench result).
- `package/src/firebase_auth/decode_jwt_payload.bench.ts` — MODIFY. Add a case with a longer/realistic signature segment (where skipping the third split segment matters most).
- `package/src/firebase_auth/middleware/update_session.ts` — MODIFY. Request-scoped decode memoization.
- `package/src/firebase_auth/middleware/update_session.test.ts` — MODIFY. Add call-count TDD tests.
- `package/src/firebase_auth/middleware/update_session.bench.ts` — MODIFY. Add the two redundant-decode scenarios as bench cases.
- `package/README.md`, `package/CHANGELOG.md`, `package/package.json`, `package/package-lock.json` — MODIFY in the final task.

---

### Task 1: Baseline — fill the missing bench and add redundant-decode bench cases

**Files:**
- Create: `package/src/firebase_auth/is_whitelisted.bench.ts`
- Modify: `package/src/firebase_auth/middleware/update_session.bench.ts`

**Interfaces:**
- Consumes: `isWhitelisted` from `./is_whitelisted.js`; `makeTestRequest` from `../../test_utils/mock_next_server.js` (already used by the existing benches in this file).
- Produces: baseline bench JSON at `$SCRATCH/bench-baseline.json`. Later tasks compare against it.

- [ ] **Step 1: Create the whitelist bench**

Create `package/src/firebase_auth/is_whitelisted.bench.ts`:

```ts
import { bench, describe } from 'vitest';
import isWhitelisted from './is_whitelisted.js';

const shortList = ['/bonds', '/inflation', '/articles'];
const longList = Array.from({ length: 30 }, (_, i) => `/section-${i}`);

describe('isWhitelisted: short list (3 entries)', () => {
    bench('exact match (first entry)', () => {
        isWhitelisted('/bonds', shortList);
    });
    bench('prefix match (last entry)', () => {
        isWhitelisted('/articles/some-slug', shortList);
    });
    bench('no match (scans every entry)', () => {
        isWhitelisted('/dashboard', shortList);
    });
});

describe('isWhitelisted: long list (30 entries)', () => {
    bench('no match (scans every entry)', () => {
        isWhitelisted('/dashboard', longList);
    });
    bench('prefix match (last entry)', () => {
        isWhitelisted('/section-29/nested', longList);
    });
});
```

- [ ] **Step 2: Add redundant-decode bench cases to `update_session.bench.ts`**

Append to `package/src/firebase_auth/middleware/update_session.bench.ts` (inside the existing `describe('updateSession', ...)` block, after the last existing `bench(...)` call, before the closing `});`):

```ts
    bench('valid session + verifyEmailPath configured, protected page (expiry + email_verified checks)', async () => {
        const { default: updateSession } = await import('./update_session.js');
        const req = makeTestRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: makeJwt(Date.now() / 1000 + 3600, { email_verified: true }) },
        });
        await updateSession(req, NextResponse.next(), 'en');
    });

    bench('valid session on verifyEmailPath, already verified (expiry + two email_verified checks)', async () => {
        const { default: updateSession } = await import('./update_session.js');
        const req = makeTestRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: makeJwt(Date.now() / 1000 + 3600, { email_verified: true }) },
        });
        await updateSession(req, NextResponse.next(), 'en');
    });
```

`baseFa` in this file already has `verifyEmailPath: '/verify-email'` (see the existing `const baseFa = {...}` block) — both new cases exercise that branch as-is, no `baseFa` change needed.

- [ ] **Step 3: Wire the firebase_auth benches into `vitest.bench.config.ts`**

None of `firebase_auth`'s ten existing `*.bench.ts` files (`decode_jwt_payload.bench.ts`, `require_config.bench.ts`, `middleware/update_session.bench.ts`, etc.) are currently reachable by `npm run bench` — `vitest.bench.config.ts`'s `benchmark.include` only lists `src/server/components/helper_script.bench.ts` and `src/image_optimizer/*.bench.ts`. In `package/vitest.bench.config.ts`, replace the `include` array:

```ts
            include: [
                'src/server/components/helper_script.bench.ts',
                'src/image_optimizer/*.bench.ts',
                'src/firebase_auth/**/*.bench.ts',
            ],
```

- [ ] **Step 4: Run the benches and store the baseline**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
BENCH_JSON="$SCRATCH/bench-baseline.json" npm run bench
```

Expected: all firebase_auth bench suites now report timings alongside the existing ones. `$SCRATCH/bench-baseline.json` exists and is non-empty. Record the means for `isWhitelisted: long list` and both new `updateSession` cases in the commit message.

- [ ] **Step 5: Commit**

```bash
git add vitest.bench.config.ts src/firebase_auth/is_whitelisted.bench.ts src/firebase_auth/middleware/update_session.bench.ts
git commit -m "test: wire firebase_auth benches into bench config, add whitelist and redundant-decode cases"
```

---

### Task 2: Allocation-free prefix check in `is_whitelisted.ts`

**Files:**
- Modify: `package/src/firebase_auth/is_whitelisted.ts`
- Modify: `package/src/firebase_auth/is_whitelisted.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `isWhitelisted(path, whiteListPaths)` — same signature and same boolean result for every input; only the internal check changes.

- [ ] **Step 1: Write the failing test**

Add to `package/src/firebase_auth/is_whitelisted.test.ts`, inside the existing `describe('isWhitelisted', ...)` block:

```ts
    it('does not match when path is a strict prefix of the entry itself (no boundary char)', () => {
        expect(isWhitelisted('/bond', ['/bonds'])).toBe(false);
    });

    it('matches a single-character path segment right after the entry', () => {
        expect(isWhitelisted('/bonds/a', ['/bonds'])).toBe(true);
    });
```

This doesn't fail against the current implementation (it's already correct) — it exists to pin the boundary behavior the new implementation must preserve. Run it now to confirm it already passes:

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npx vitest run src/firebase_auth/is_whitelisted.test.ts
```

Expected: PASS (all tests, old and new).

- [ ] **Step 2: Replace the per-entry string concatenation**

In `package/src/firebase_auth/is_whitelisted.ts`, replace the `return` line:

```ts
export default function isWhitelisted(path: string, whiteListPaths: readonly string[] | undefined): boolean {
    if (!whiteListPaths) return false;
    // `path.startsWith(entry) && path.charCodeAt(entry.length) === 47` (47 = '/')
    // is equivalent to `path.startsWith(`${entry}/`)` but never allocates a new
    // string per entry — this runs on every request whose path doesn't exactly
    // match an early entry, i.e. most requests through the middleware.
    return whiteListPaths.some((entry) => path === entry || (path.startsWith(entry) && path.charCodeAt(entry.length) === 47));
}
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/firebase_auth/is_whitelisted.test.ts
```

Expected: PASS, all existing + new cases.

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: PASS with 100% per-file coverage on `is_whitelisted.ts`.

- [ ] **Step 5: Bench and record the win**

```bash
BENCH_JSON="$SCRATCH/bench-task2.json" npm run bench
```

Compare `isWhitelisted: short list` and `isWhitelisted: long list` means against `$SCRATCH/bench-baseline.json`; put the numbers in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/firebase_auth/is_whitelisted.ts src/firebase_auth/is_whitelisted.test.ts
git commit -m "perf: avoid per-entry string allocation in isWhitelisted"
```

---

### Task 3: Bench-gated micro-optimization of `decode_jwt_payload.ts`

**Files:**
- Modify: `package/src/firebase_auth/decode_jwt_payload.ts` (only if the bench justifies it)
- Modify: `package/src/firebase_auth/decode_jwt_payload.bench.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `decodeJwtPayload(token)` — identical signature and identical return value for every input (proven by the existing, unmodified `decode_jwt_payload.test.ts`, which is NOT changed by this task).

- [ ] **Step 1: Add a bench case with a realistic (longer) signature segment**

The current bench's tokens use a 3-byte dummy signature (`sig`), which doesn't expose the cost of scanning past it. Append to `package/src/firebase_auth/decode_jwt_payload.bench.ts`:

```ts
// Real Firebase ID tokens are RS256-signed: a ~342-character base64url
// signature segment. `split('.')` must scan/copy all of it to build the
// (unused) third array element; `split('.', 2)` does not.
const realisticSignature = 'a'.repeat(342);
const realisticJwt = `${realisticToken.split('.').slice(0, 2).join('.')}.${realisticSignature}`;

describe('decodeJwtPayload: realistic RS256-length signature', () => {
    bench('valid token, ~342-char signature segment', () => {
        decodeJwtPayload(realisticJwt);
    });
});
```

- [ ] **Step 2: Run the baseline for this specific case**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
BENCH_JSON="$SCRATCH/bench-decode-before.json" npx vitest bench --run --config vitest.bench.config.ts src/firebase_auth/decode_jwt_payload.bench.ts
```

Record the mean for `valid token, ~342-char signature segment` and `valid token, realistic payload size`.

- [ ] **Step 3: Apply the candidate implementation**

In `package/src/firebase_auth/decode_jwt_payload.ts`, replace the body:

```ts
export default function decodeJwtPayload(token: string): { exp?: number; iat?: number; email_verified?: boolean } | null {
    try {
        // `split('.', 2)` stops after the second segment instead of also
        // scanning/copying the (here, unused) signature segment; two plain
        // `.replace()` calls avoid a per-match callback function versus one
        // `.replace(/[-_]/g, fn)` — both are behaviorally identical to the
        // previous implementation (see decode_jwt_payload.test.ts), only cheaper.
        const payload = token.split('.', 2)[1];
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const exp = EXP_RE.exec(json);
        const iat = IAT_RE.exec(json);
        const emailVerified = EMAIL_VERIFIED_RE.exec(json);
        return {
            exp: exp ? Number(exp[1]) : undefined,
            iat: iat ? Number(iat[1]) : undefined,
            email_verified: emailVerified ? emailVerified[1] === 'true' : undefined,
        };
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run the existing test suite to prove equivalence**

```bash
npx vitest run src/firebase_auth/decode_jwt_payload.test.ts
```

Expected: PASS, all cases unchanged — including "returns null for a malformed token" (`'not-a-jwt'`, which has zero dots: `'not-a-jwt'.split('.', 2)` yields `['not-a-jwt']`, index `1` is `undefined`, `.replace` on `undefined` throws, caught, `null` — identical to the old `.split('.')[1]` path) and "returns null for a token whose payload is not valid base64/JSON" (`'header.%%%.sig'`).

- [ ] **Step 5: Bench the candidate**

```bash
BENCH_JSON="$SCRATCH/bench-decode-after.json" npx vitest bench --run --config vitest.bench.config.ts src/firebase_auth/decode_jwt_payload.bench.ts
```

- [ ] **Step 6: Apply the decision rule**

Compare `$SCRATCH/bench-decode-before.json` and `$SCRATCH/bench-decode-after.json` for both `decodeJwtPayload` describe blocks. If the candidate is faster (any measurable, consistent improvement — re-run once if the two are within noise of each other) on the realistic-signature case without regressing the realistic-payload-size case, keep it. If it's not faster (or noisier/slower), revert `decode_jwt_payload.ts` to its original body with `git checkout -- src/firebase_auth/decode_jwt_payload.ts` and keep only the new bench case plus a one-line note in the commit message recording the measured (non-)improvement.

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: PASS with 100% per-file coverage on `decode_jwt_payload.ts` regardless of which way Step 6 went.

- [ ] **Step 8: Commit**

If the candidate was kept:

```bash
git add src/firebase_auth/decode_jwt_payload.ts src/firebase_auth/decode_jwt_payload.bench.ts
git commit -m "perf: skip the signature segment and callback-free base64url decode in decodeJwtPayload"
```

If reverted:

```bash
git add src/firebase_auth/decode_jwt_payload.bench.ts
git commit -m "test: bench decodeJwtPayload against a realistic signature length"
```

---

### Task 4: Request-scoped JWT decode memoization in `update_session.ts`

**Files:**
- Modify: `package/src/firebase_auth/middleware/update_session.ts`
- Modify: `package/src/firebase_auth/middleware/update_session.test.ts`

**Interfaces:**
- Consumes: `decodeJwtPayload` from `../decode_jwt_payload.js` (Task 3's version, whichever way it went).
- Produces: `isIdTokenExpired(token)` — same exported signature, same behavior (now implemented via a new private `isTokenExpired(decoded)` helper). `updateSession`'s external behavior (every redirect/pass-through/cookie decision) is unchanged — only how many times `decodeJwtPayload` gets called for the same token string per invocation changes.

- [ ] **Step 1: Write the failing tests**

Add to `package/src/firebase_auth/middleware/update_session.test.ts`, in its own `describe` block (needs `import * as decodeJwtPayloadModule from '../decode_jwt_payload.js';` added to the top-level imports):

```ts
describe('updateSession: JWT decode memoization', () => {
    it('decodes the session token only once for a protected page when verifyEmailPath is configured', async () => {
        currentConfig = {
            locales: ['en', 'de'],
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, verifyEmailPath: '/verify-email' },
        };
        const spy = vi.spyOn(decodeJwtPayloadModule, 'default');
        const { default: updateSession } = await import('./update_session.js');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: true });
        const req = makeRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: token },
        });

        await updateSession(req, NextResponse.next(), 'en');

        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('decodes the session token only once on verifyEmailPath for an already-verified session', async () => {
        currentConfig = {
            locales: ['en', 'de'],
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, verifyEmailPath: '/verify-email' },
        };
        const spy = vi.spyOn(decodeJwtPayloadModule, 'default');
        const { default: updateSession } = await import('./update_session.js');
        const token = makeJwt(Math.floor(Date.now() / 1000) + 3600, { email_verified: true });
        const req = makeRequest('https://example.com/en/verify-email', {
            cookies: { __fa_session__: token },
        });

        const response = await updateSession(req, NextResponse.next(), 'en');

        expect(response.headers.get('location')).toContain('/en');
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
```

- [ ] **Step 2: Run to verify both fail**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npx vitest run src/firebase_auth/middleware/update_session.test.ts -t "JWT decode memoization"
```

Expected: FAIL — first test reports 2 calls (once for the expiry check, once for the `email_verified` check), second reports 3 (expiry check, the `isVerifyEmailPage` block's check, and the final redirect-decision check).

- [ ] **Step 3: Refactor `isJwtExpired` to operate on an already-decoded payload**

In `package/src/firebase_auth/middleware/update_session.ts`, replace:

```ts
function isJwtExpired(token: string): boolean {
    const decoded = decodeJwtPayload(token);
    return !decoded?.exp || decoded.exp * 1000 - CLOCK_SKEW_MARGIN_MS <= Date.now();
}
```

with:

```ts
function isTokenExpired(decoded: ReturnType<typeof decodeJwtPayload>): boolean {
    return !decoded?.exp || decoded.exp * 1000 - CLOCK_SKEW_MARGIN_MS <= Date.now();
}

function isJwtExpired(token: string): boolean {
    return isTokenExpired(decodeJwtPayload(token));
}
```

`isJwtExpired`/`isIdTokenExpired` keep their exact external signature and behavior — `refreshIdToken`'s `isJwtExpired(cached.idToken)` call (a different token than the request's session token, never re-decoded elsewhere in the same call) is untouched.

- [ ] **Step 4: Add the request-scoped memoized decode**

In `updateSession`, immediately after the `const refreshTokenCookieName = ...` line (before `const rawPath = request.nextUrl.pathname;`), add:

```ts
    // Firebase's own session-cookie/email-verification checks below can
    // decode the SAME token string up to three times in one invocation
    // (expiry check, verifyEmailPath's own check, the final redirect
    // decision) — this cache makes every repeat a plain Map lookup instead
    // of re-running decodeJwtPayload. Scoped to this call: a fresh Map per
    // request, never shared across requests.
    const decodedTokens = new Map<string, ReturnType<typeof decodeJwtPayload>>();
    function decode(t: string): ReturnType<typeof decodeJwtPayload> {
        if (!decodedTokens.has(t)) decodedTokens.set(t, decodeJwtPayload(t));
        return decodedTokens.get(t)!;
    }
```

- [ ] **Step 5: Route every in-function decode through the memoized wrapper**

Replace the five remaining `decodeJwtPayload(` call sites inside `updateSession` (leave `isJwtExpired`/`isTokenExpired` themselves and every OTHER file's `decodeJwtPayload` call untouched):

1. `if (token && isJwtExpired(token)) {` → `if (token && isTokenExpired(decode(token))) {`
2. `&& decodeJwtPayload(token!)?.email_verified === false` (in the `isVerifyEmailPage` block) → `&& decode(token!)?.email_verified === false`
3. `if (fa.verifyEmailPath && !isVerifyEmailPage && hasSession && decodeJwtPayload(token!)?.email_verified === false) {` → `... && decode(token!)?.email_verified === false) {`
4. `unverifiedEmail = hint !== 'true' && decodeJwtPayload(token)?.email_verified === false;` (post-refresh branch) → `... decode(token)?.email_verified === false;`
5. `unverifiedEmail = hint !== 'true' && decodeJwtPayload(token!)?.email_verified === false;` (else branch) → `... decode(token!)?.email_verified === false;`
6. `} else if (isAuthPage || (isVerifyEmailPage && decodeJwtPayload(token!)?.email_verified === true)) {` → `... decode(token!)?.email_verified === true)) {`

- [ ] **Step 6: Run the memoization tests**

```bash
npx vitest run src/firebase_auth/middleware/update_session.test.ts -t "JWT decode memoization"
```

Expected: PASS, both call counts now 1.

- [ ] **Step 7: Run the full `update_session.test.ts` file, then the full suite**

```bash
npx vitest run src/firebase_auth/middleware/update_session.test.ts
npm test
```

Expected: PASS — every one of the existing ~70 `updateSession` tests still passes unchanged (this is the proof the memoization altered nothing observable), and 100% per-file coverage holds for `update_session.ts`.

- [ ] **Step 8: Bench and record the win**

```bash
BENCH_JSON="$SCRATCH/bench-task4.json" npm run bench
```

Compare the two new `updateSession` bench cases from Task 1 against `$SCRATCH/bench-baseline.json`; put the numbers in the commit message.

- [ ] **Step 9: Commit**

```bash
git add src/firebase_auth/middleware/update_session.ts src/firebase_auth/middleware/update_session.test.ts
git commit -m "perf: memoize decodeJwtPayload per request in updateSession"
```

---

### Task 5: Final verification, changelog, version bump

**Files:**
- Modify: `package/CHANGELOG.md`
- Modify: `package/package.json`, `package/package-lock.json`

**Interfaces:**
- Consumes: the outcomes of Tasks 2-4.

- [ ] **Step 1: Full verification**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
npm test
npm run build
npm run check:exports
npm run check:size
BENCH_JSON="$SCRATCH/bench-final.json" npm run bench
```

Expected: all PASS. Do not claim completion until every one of these has actually been run and its output inspected.

- [ ] **Step 2: Add the changelog entry**

Add a new version section at the TOP of `package/CHANGELOG.md` (newest first, per this repo's convention), covering: allocation-free `isWhitelisted` prefix check, the `decodeJwtPayload` micro-optimization (state clearly whether it was kept or the bench showed no gain), and the request-scoped JWT decode memoization in `updateSession` (state the before/after decode-call-count for the two scenarios: 2→1 and 3→1). Include the measured speedup from `$SCRATCH/bench-final.json` vs `$SCRATCH/bench-baseline.json` for each of: `isWhitelisted: long list`, `decodeJwtPayload: realistic RS256-length signature`, and both new `updateSession` cases.

- [ ] **Step 3: Bump the version**

Bump the patch version in `package/package.json` (internal perf work, no API change) and run `npm install --package-lock-only` so `package-lock.json` matches.

- [ ] **Step 4: Report**

Produce a before/after table: for each bench case touched by this plan, the baseline mean from `$SCRATCH/bench-baseline.json` and the final mean from `$SCRATCH/bench-final.json`, plus the percentage change. State explicitly that no output/behavior changed (all existing tests pass unmodified in their assertions) and which of Task 3's two outcomes occurred.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m "docs: document firebase_auth perf work and bench results"
```

# DB Module Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speed up the CPU-bound hot paths of `package/src/db` (SQL tokenizing/parsing, param inlining/encoding, PostgREST filter building, result shaping) the same way `image_optimizer` was optimized: try concrete alternative implementations, measure them with vitest bench, keep only the variant that wins, and never change observable output.

**Architecture:** No new abstractions. Each task edits one existing module in place, benchmarks the change against the pre-change baseline using `package/src/db/db_performance.bench.ts` (currently **not wired into the bench runner** — Task 1 fixes that), and is gated by the module's existing exhaustive unit tests, which already assert exact (`toEqual`/`toBe`) output for every code path. A change is kept only if the full test suite stays green, per-file coverage stays 100%, and the bench shows a real win; otherwise it is reverted and the finding is written into the task's commit message (the project already has precedent for this in commit `4e81101`, which documented a change it deliberately did not keep).

**Tech Stack:** TypeScript, Vitest (`vitest run --coverage` for tests, `vitest bench --run --config vitest.bench.config.ts` for benchmarks), no new dependencies.

**Spec:** This plan (no separate spec doc — requirements come directly from the user's request, captured in the Global Constraints below).

## Global Constraints

- Every optimized function must remain byte/behavior-identical for all existing inputs: same return value, same thrown error type/message, same call sequence to any injected builder/client.
- `npm test` (`vitest run --coverage`) must stay fully green, and per-file coverage must stay at 100% statements/branches/functions/lines (enforced by `vitest.config.ts`'s `coverage.thresholds['src/**/!(general_functions|middleware).{ts,tsx}']`) for every file touched.
- `npm run bench` must actually execute `src/db/db_performance.bench.ts` (Task 1) so every later task's "did it get faster" claim is backed by a real run, not assumption.
- Only keep a change if the benchmark shows a real improvement; if a candidate is neutral or slower, revert it and record the measurement and reasoning in the commit message instead of forcing it in.
- Files in scope: `sql_tokens.ts`, `parse_statement.ts` (verification only — see Task 2), `parse_where.ts`, `inline_params.ts`, `encode_param.ts`, `rest_filters.ts`, `connection.ts`, `context.ts`, `rest_execute.ts`, plus `db_performance.bench.ts` and `vitest.bench.config.ts`.
- No behavior changes to public exports' signatures. No new npm dependencies.

---

## File Structure

**Modify:**
- `package/vitest.bench.config.ts` — add `src/db/*.bench.ts` to `benchmark.include` (it is currently missing, so `npm run bench` silently skips the entire db suite).
- `package/src/db/db_performance.bench.ts` — add benches for `executeRest` (currently unbenched) and a mixed-type `encodeParam` workload; no changes needed for `connection.ts`/`context.ts` (see Task 8 for why).
- `package/src/db/sql_tokens.ts` — drop two defensive `.slice()` copies that are unnecessary (verified: no caller mutates the returned token array).
- `package/src/db/inline_params.ts` — try array-join vs `+=` string building for the substituted output; replace the regex-based dollar-quote tag scan with a manual character scan.
- `package/src/db/encode_param.ts` — try reordering the type-check chain.
- `package/src/db/parse_where.ts` — try restructuring `parseComparison`'s dispatch to branch on `token.kind` before checking specific keywords/operators.
- `package/src/db/rest_filters.ts` — try `switch (node.kind)` instead of the sequential `if` chain in `applyWhere` and `serialize`.
- `package/src/db/rest_execute.ts` — try manual loops instead of `.map()`/`Object.fromEntries()` for row shaping.
- `package/src/db/connection.ts`, `package/src/db/context.ts` — targeted, low-risk hoists only (module-level regex constant, non-capturing closure hoisted out of a hot function), verified by existing unit tests, not new benchmarks.

**Test files** (extend in place, no new files needed — all target modules already have exhaustive `*.test.ts` files that assert exact output):
- `package/src/db/sql_tokens.test.ts` — add one reference-identity regression test.
- Existing tests for `inline_params.ts`, `encode_param.ts`, `parse_where.ts`, `rest_filters.ts`, `rest_execute.ts`, `connection.ts`, `context.ts` are reused unchanged as the correctness gate for every task below; no test edits are needed there because none of the planned changes alter observable behavior or add new branches.

---

### Task 1: Wire the db bench suite into the bench runner and capture a baseline

**Files:**
- Modify: `package/vitest.bench.config.ts`
- Read only: `package/src/db/db_performance.bench.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: a baseline `bench-result.json` (or console table) that every later task compares against. No code interface changes.

- [ ] **Step 1: Confirm the bug**

Run:
```bash
cd package && npm run bench
```
Expected: the output lists benchmarks only from `src/server/components/helper_script.bench.ts` and `src/image_optimizer/*.bench.ts` — no `DB Module Branch Benchmarks` group appears, because `vitest.bench.config.ts`'s `benchmark.include` array does not list any `src/db/*` glob.

- [ ] **Step 2: Add the db bench glob**

In `package/vitest.bench.config.ts`, change:
```ts
        benchmark: {
            include: [
                'src/server/components/helper_script.bench.ts',
                'src/image_optimizer/*.bench.ts',
            ],
            outputJson: process.env.BENCH_JSON ?? './bench-result.json',
        },
```
to:
```ts
        benchmark: {
            include: [
                'src/server/components/helper_script.bench.ts',
                'src/image_optimizer/*.bench.ts',
                'src/db/*.bench.ts',
            ],
            outputJson: process.env.BENCH_JSON ?? './bench-result.json',
        },
```

- [ ] **Step 3: Run the bench suite and capture the baseline**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-baseline.txt
```
Expected: a `DB Module Branch Benchmarks` group appears with sub-groups `tokenizeSql`, `parseStatement`, `parseWhere`, `inlineParams`, `encodeParam`, `parseComposite`, `buildRestFilters`, `parseExecResult`, `helpers`, `resolveRawSql`, each with hz/mean numbers. Keep this file — every later task's "faster" claim is a diff against these numbers.

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

Run:
```bash
cd package && npm test
```
Expected: all suites pass, coverage thresholds pass (the config change touches no `src/**` coverage-instrumented file).

- [ ] **Step 5: Commit**

```bash
git add package/vitest.bench.config.ts
git commit -m "$(cat <<'EOF'
fix: wire the db module's benchmark suite into the bench runner

db_performance.bench.ts existed but vitest.bench.config.ts never listed
src/db/*.bench.ts in benchmark.include, so `npm run bench` silently
skipped it. Needed as the baseline for the upcoming db perf work.
EOF
)"
```

---

### Task 2: `sql_tokens.ts` — drop unnecessary defensive array copies

**Files:**
- Modify: `package/src/db/sql_tokens.ts:25-28,141-144`
- Test: `package/src/db/sql_tokens.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `tokenizeSql(sql: string): SqlToken[]` — same signature, same values; the returned array is now the *same reference* on repeated calls with equal `sql` instead of a fresh copy each time. `parse_statement.ts:90` (`const tokens = tokenizeSql(sql)`) only reads `tokens[i]`/`tokens.length`, never mutates, so this is safe — verified via `grep -rn "tokens\.(push|splice|pop|shift|unshift|sort|reverse)" package/src/db` returning zero matches outside `sql_tokens.ts` itself, and `parse_statement.ts` already returns *its own* cached object by reference with no copy, so this brings `sql_tokens.ts` in line with the pattern already trusted elsewhere in this module.

- [ ] **Step 1: Add a regression test locking in the optimization**

In `package/src/db/sql_tokens.test.ts`, add inside the existing `describe('tokenizeSql', ...)` block:
```ts
    it('returns the same array reference for a cached statement', () => {
        const first = tokenizeSql('select "x" from "t" where "id" = $1');
        const second = tokenizeSql('select "x" from "t" where "id" = $1');
        expect(second).toBe(first);
    });
```

- [ ] **Step 2: Run the test to verify it fails against current code**

Run:
```bash
cd package && npx vitest run src/db/sql_tokens.test.ts
```
Expected: FAIL on the new test — `expected [Array] to be [Array]` (current code returns `cached.slice()`, a copy, so `second !== first`).

- [ ] **Step 3: Remove the two defensive copies**

In `package/src/db/sql_tokens.ts`, change:
```ts
    const cached = TOKEN_CACHE.get(sql);
    if (cached) return cached.slice();
```
to:
```ts
    const cached = TOKEN_CACHE.get(sql);
    if (cached) return cached;
```
and change:
```ts
    if (TOKEN_CACHE.size >= MAX_CACHE_SIZE) TOKEN_CACHE.clear();
    TOKEN_CACHE.set(sql, tokens);

    return tokens.slice();
}
```
to:
```ts
    if (TOKEN_CACHE.size >= MAX_CACHE_SIZE) TOKEN_CACHE.clear();
    TOKEN_CACHE.set(sql, tokens);

    return tokens;
}
```

- [ ] **Step 4: Run the full sql_tokens and parse_statement test files**

Run:
```bash
cd package && npx vitest run src/db/sql_tokens.test.ts src/db/parse_statement.test.ts src/db/parse_where.test.ts
```
Expected: all PASS, including the new reference-identity test.

- [ ] **Step 5: Run coverage for this file**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/sql_tokens.ts'
```
Expected: 100% statements/branches/functions/lines (no branch was added or removed, only two `return` expressions changed).

- [ ] **Step 6: Benchmark against the Task 1 baseline**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-after-tokens.txt
diff <(grep -A5 "tokenizeSql" /tmp/db-bench-baseline.txt) <(grep -A5 "tokenizeSql" /tmp/db-bench-after-tokens.txt)
```
Expected: `tokenizeSql` group hz (ops/sec) increases for all four cases (Select/Insert/Update/Delete statement), since every call after the first now skips one full-array copy. If any case regresses, investigate before proceeding — this change has no correctness tradeoff to weigh against, so a regression would mean something else changed.

- [ ] **Step 7: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green, all coverage thresholds met.

- [ ] **Step 8: Commit**

```bash
git add package/src/db/sql_tokens.ts package/src/db/sql_tokens.test.ts
git commit -m "$(cat <<'EOF'
perf: return cached token arrays by reference instead of copying

tokenizeSql() copied the cached array on every hit (and once more on
every miss before caching), even though nothing downstream mutates the
returned array — parse_statement.ts only reads it, and its own
STATEMENT_CACHE already returns cached objects by reference with no
copy. Dropping the copy removes an O(n) allocation from every cached
call.
EOF
)"
```

---

### Task 3: `inline_params.ts` — string-building strategy and dollar-quote scan

**Files:**
- Modify: `package/src/db/inline_params.ts`
- Test: `package/src/db/inline_params.test.ts` (unchanged — used as the correctness gate)

**Interfaces:**
- Consumes: `encodeParam` from `./encode_param.js` (unchanged).
- Produces: `inlineParams(statement: string, params: unknown[]): string` — same signature, same output for every case in `inline_params.test.ts`, including the dollar-quote cases (`'do $$ unterminated'`, `'do $tag$ select $1; $tag$ , $1'`, `'select $!foo'`).

- [ ] **Step 1: Try array-join instead of `+=` for the substituted output**

In `package/src/db/inline_params.ts`, change the function to build into a `parts: string[]` array instead of a `result` string, joining once at the end:
```ts
export default function inlineParams(statement: string, params: unknown[]): string {
    const parts: string[] = [];
    let i = 0;
    let lastIndex = 0;
    const len = statement.length;
    let replaced = false;

    while (i < len) {
        const code = statement.charCodeAt(i);

        if (code === 45 && statement.charCodeAt(i + 1) === 45) { // --
            const end = statement.indexOf('\n', i);
            const stop = end === -1 ? len : end + 1;
            i = stop;
            continue;
        }

        if (code === 47 && statement.charCodeAt(i + 1) === 42) { // /*
            const end = statement.indexOf('*/', i + 2);
            const stop = end === -1 ? len : end + 2;
            i = stop;
            continue;
        }

        if (code === 39 || (code === 69 && statement.charCodeAt(i + 1) === 39)) { // ' or E'
            const start = code === 69 ? i + 1 : i;
            const end = findStringEnd(statement, start + 1);
            i = end;
            continue;
        }

        if (code === 34) { // "
            const end = findQuotedIdentifierEnd(statement, i + 1);
            i = end;
            continue;
        }

        if (code === 36) { // $
            const nextCode = statement.charCodeAt(i + 1);
            if (nextCode >= 48 && nextCode <= 57) {
                let j = i + 2;
                while (j < len) {
                    const c = statement.charCodeAt(j);
                    if (c >= 48 && c <= 57) j++;
                    else break;
                }
                const index = Number(statement.slice(i + 1, j));
                if (index < 1 || index > params.length) {
                    throw new Error(`db: statement references $${index} but only ${params.length} param(s) were provided.`);
                }
                if (i > lastIndex) parts.push(statement.slice(lastIndex, i));
                parts.push(encodeParam(params[index - 1]));
                replaced = true;
                i = j;
                lastIndex = j;
                continue;
            }

            const tagEnd = findDollarQuoteEnd(statement, i);
            i = tagEnd;
            continue;
        }

        i++;
    }

    if (!replaced) return statement;
    if (lastIndex < len) parts.push(statement.slice(lastIndex));
    return parts.join('');
}
```
(`findStringEnd`, `findQuotedIdentifierEnd` stay as-is for now — `findDollarQuoteEnd` is replaced in Step 4.)

- [ ] **Step 2: Run the existing test suite**

Run:
```bash
cd package && npx vitest run src/db/inline_params.test.ts
```
Expected: all PASS unchanged (output is identical; only the internal accumulation strategy changed).

- [ ] **Step 3: Benchmark array-join vs the Task 1 baseline `+=`**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-inline-join.txt
diff <(grep -A3 "inlineParams" /tmp/db-bench-baseline.txt) <(grep -A3 "inlineParams" /tmp/db-bench-inline-join.txt)
```
Record the hz for "Select with 6 params" and "Insert with 9 params". If array-join is faster (or within noise but no worse), keep it and proceed to Step 4. If it is measurably slower (V8's rope-string handling of `+=` often beats manual chunking for this size of input), revert Step 1 back to the original `+=`/`result` version before proceeding — check it out with:
```bash
git checkout -- package/src/db/inline_params.ts
```
and re-apply only the dollar-quote change from Step 4 on top of the original.

- [ ] **Step 4: Replace the regex-based dollar-quote scan with a manual scan**

Independently of the Step 3 decision, replace:
```ts
function findDollarQuoteEnd(statement: string, from: number): number {
    const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(statement.slice(from));
    if (!tagMatch) return from + 1;
    const tag = tagMatch[0];
    const bodyStart = from + tag.length;
    const closeIndex = statement.indexOf(tag, bodyStart);
    return closeIndex === -1 ? statement.length : closeIndex + tag.length;
}
```
with:
```ts
function findDollarQuoteEnd(statement: string, from: number): number {
    const len = statement.length;
    let i = from + 1;
    const first = statement.charCodeAt(i);

    if (first === 36) {
        i++; // empty tag: $$
    } else if ((first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95) {
        i++;
        while (i < len) {
            const c = statement.charCodeAt(i);
            if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) i++;
            else break;
        }
        if (statement.charCodeAt(i) !== 36) return from + 1; // not a closed tag
        i++;
    } else {
        return from + 1; // '$' is not starting a valid dollar-quote tag
    }

    const tag = statement.slice(from, i);
    const closeIndex = statement.indexOf(tag, i);
    return closeIndex === -1 ? len : closeIndex + tag.length;
}
```
This mirrors `/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/` exactly: an optional identifier (must start with a letter/underscore, may continue with letters/digits/underscore) between two `$`, with the same "not a valid tag" fallback (`from + 1`, meaning the lone `$` is treated as an ordinary character and re-scanned from the next position) that the regex path took when `tagMatch` was `null`.

- [ ] **Step 5: Run the full inline_params test file, including dollar-quote cases**

Run:
```bash
cd package && npx vitest run src/db/inline_params.test.ts
```
Expected: all PASS, in particular:
- `'treats an unterminated dollar-quoted body as running to the end of the statement'`
- `'leaves dollar-quoted bodies untouched, including a tagged body containing $1'` (both untagged `$$` and tagged `$tag$` cases)
- `'treats a $ not starting a placeholder or a valid dollar-quote tag as a literal character'`
- `'leaves a trailing bare $ at the end of the statement untouched'`

- [ ] **Step 6: Run coverage for this file**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/inline_params.ts'
```
Expected: 100% statements/branches/functions/lines. The manual scan has more branches than the regex call it replaced (the regex hid its internal branching inside the engine); confirm the existing test cases above exercise all of: empty tag (`$$`), a valid tagged path (`$tag$`), a non-letter/underscore first character (`$!foo` from the "not a valid dollar-quote tag" test — actually this goes through the `$` + non-digit branch in the outer function, then into `findDollarQuoteEnd` with `from` pointing at that `$`; first char after it is `!`, which is not `$` and not a letter/underscore, hitting the final `else return from + 1` branch), and the "starts like a tag but never closes" case (unterminated `$$ unterminated` / no closing `$tag$`).

- [ ] **Step 7: Benchmark the full inlineParams suite**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-after-inline.txt
diff <(grep -A3 "inlineParams" /tmp/db-bench-baseline.txt) <(grep -A3 "inlineParams" /tmp/db-bench-after-inline.txt)
```
Note: the bench file's `complexSql`/`insertSql` fixtures contain no dollar-quoted text, so this specific change is not expected to move those two numbers — it only matters on the (rarer) dollar-quoted-statement path, which is exercised by the unit tests, not the bench. Record this in the commit message rather than claiming a bench win that the fixtures cannot show.

- [ ] **Step 8: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add package/src/db/inline_params.ts package/src/db/inline_params.test.ts
git commit -m "$(cat <<'EOF'
perf: build inlineParams output without a regex on the dollar-quote path

<fill in the array-join vs += decision and measured hz from Step 3 here>

Replaced the regex-based dollar-quote tag match with a manual
character scan mirroring the same grammar. This only affects
statements containing $$.../$tag$...$tag$ bodies, which the bench
fixtures don't exercise — verified via inline_params.test.ts instead.
EOF
)"
```

---

### Task 4: `encode_param.ts` — type-check ordering

**Files:**
- Modify: `package/src/db/encode_param.ts`
- Modify: `package/src/db/db_performance.bench.ts` (add a mixed-type workload)
- Test: `package/src/db/encode_param.test.ts` (unchanged — correctness gate)

**Interfaces:**
- Consumes: nothing new.
- Produces: `encodeParam(value: unknown): string` — same signature and output for every case in `encode_param.test.ts`.

- [ ] **Step 1: Add a mixed-type bench case that reflects realistic param traffic**

In `package/src/db/db_performance.bench.ts`, inside `describe('encodeParam', ...)`, add:
```ts
        bench('Mixed realistic param batch', () => {
            encodeParam('jane@example.com');
            encodeParam(42);
            encodeParam('active');
            encodeParam(new Date('2026-01-01T00:00:00Z'));
            encodeParam(null);
            encodeParam(true);
            encodeParam('another string value');
        });
```
This exists because the current bench only measures each type in perfect isolation, which can't show whether reordering the type-check chain in `encode_param.ts` helps or hurts overall — a realistic call mix (string-heavy, per most app schemas) can.

- [ ] **Step 2: Run bench, capture the baseline for this new case**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-encode-baseline.txt
```

- [ ] **Step 3: Try moving the string check earlier in the chain**

In `package/src/db/encode_param.ts`, change:
```ts
export default function encodeParam(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return "'NaN'";
        if (value === Infinity) return "'Infinity'";
        if (value === -Infinity) return "'-Infinity'";
        return String(value);
    }
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return quoteLiteral(value.toISOString());
    if (value instanceof Uint8Array) return quoteLiteral(`\\x${bytesToHex(value)}`);
    if (Array.isArray(value)) return quoteLiteral(encodeArray(value));
    if (typeof value === 'string') return quoteLiteral(value);
    // Plain objects (jsonb columns) — pg sends these JSON-stringified.
    return quoteLiteral(JSON.stringify(value));
}
```
to:
```ts
export default function encodeParam(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'string') return quoteLiteral(value);
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return "'NaN'";
        if (value === Infinity) return "'Infinity'";
        if (value === -Infinity) return "'-Infinity'";
        return String(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return quoteLiteral(value.toISOString());
    if (value instanceof Uint8Array) return quoteLiteral(`\\x${bytesToHex(value)}`);
    if (Array.isArray(value)) return quoteLiteral(encodeArray(value));
    // Plain objects (jsonb columns) — pg sends these JSON-stringified.
    return quoteLiteral(JSON.stringify(value));
}
```

- [ ] **Step 4: Run the existing test file**

Run:
```bash
cd package && npx vitest run src/db/encode_param.test.ts
```
Expected: all PASS unchanged.

- [ ] **Step 5: Benchmark the reordering**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-encode-after.txt
diff <(grep -A9 "encodeParam" /tmp/db-bench-encode-baseline.txt) <(grep -A9 "encodeParam" /tmp/db-bench-encode-after.txt)
```
Decision rule: keep the reordering only if "Mixed realistic param batch" hz improves by more than ~3% (outside typical vitest bench noise) without a >3% regression on "Date encoding" or "Uint8Array encoding" (the two cases pushed later in the chain). If the result is inside noise either way, revert to the original ordering with:
```bash
git diff package/src/db/encode_param.ts
git checkout -- package/src/db/encode_param.ts
```
and say so plainly in the commit message — do not keep a reordering that the numbers don't support.

- [ ] **Step 6: Run coverage for this file**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/encode_param.ts'
```
Expected: 100% (reordering `if` statements doesn't add or remove branches).

- [ ] **Step 7: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add package/src/db/encode_param.ts package/src/db/db_performance.bench.ts
git commit -m "$(cat <<'EOF'
perf: bench a mixed-type encodeParam workload, <keep|revert> reorder

Added a realistic mixed-type bench case, since the existing per-type
benches can't show whether reordering the type-check chain helps in
practice. <Fill in the measured hz delta and the keep/revert decision
here.>
EOF
)"
```

---

### Task 5: `parse_where.ts` — dispatch by token kind before checking specific keywords

**Files:**
- Modify: `package/src/db/parse_where.ts:119-217` (`parseComparison`)
- Test: `package/src/db/parse_where.test.ts` (unchanged — correctness gate, already covers every operator, `is`/`is not`/`is distinct from`, `in`/`not in`, `like`/`ilike`, all four `@@` text-search flavours, and every rejection path)

**Interfaces:**
- Consumes: `SqlToken`, `isWord`, `isPunct`, `describe`, `readValue`, `OPERATORS`, `TS_QUERY_TYPES` (all already defined in this file, unchanged).
- Produces: `parseWhere(tokens: SqlToken[], start: number): WhereParse` — same signature and output for every case in `parse_where.test.ts`.

The current `parseComparison` checks, in order: `is`, `not`/`in`, `@@`, `like`/`ilike`, then finally looks up `OPERATORS[token.value]` for plain punctuation operators (`=`, `>=`, etc.). Since `=`/`>=`/etc. are the most common case in real queries (and in the bench's `complexSql` fixture: `status = $1 AND age >= $2`), they currently pay the cost of four failed `isWord` checks first. Branching on `token.kind` (`'punct'` vs `'word'`) up front lets the common punctuation-operator case skip straight to the `OPERATORS` lookup.

- [ ] **Step 1: Rewrite `parseComparison` to branch on `token.kind` first**

In `package/src/db/parse_where.ts`, replace the whole `parseComparison` function body with:
```ts
function parseComparison(tokens: SqlToken[], start: number): WhereParse {
    let index = start;
    const column = readColumn(tokens, index);
    index = column.next;

    const token = tokens[index];

    if (token?.kind === 'punct') {
        if (token.value === '@@') {
            const call = tokens[index + 1];
            if (call?.kind !== 'word' || !(call.value in TS_QUERY_TYPES)) {
                throw new UnsupportedSqlError(`full-text search via "${describe(call)}"`);
            }
            if (!isPunct(tokens[index + 2], '(')) throw new UnsupportedSqlError('malformed text-search call');
            let cursor = index + 3;
            let config: string | undefined;
            const first = readValue(tokens, cursor);
            cursor = first.next;
            let query = first.value;
            if (isPunct(tokens[cursor], ',')) {
                if (first.value.kind !== 'literal' || typeof first.value.value !== 'string') {
                    throw new UnsupportedSqlError('non-literal text-search configuration');
                }
                config = first.value.value;
                const second = readValue(tokens, cursor + 1);
                query = second.value;
                cursor = second.next;
            }
            if (!isPunct(tokens[cursor], ')')) throw new UnsupportedSqlError('unterminated text-search call');
            const node: WhereNode = { kind: 'textSearch', column: column.name, value: query };
            const type = TS_QUERY_TYPES[call.value];
            if (type) node.type = type;
            if (config) node.config = config;
            return { node, next: cursor + 1 };
        }

        const operator = OPERATORS[token.value];
        if (operator) {
            const value = readValue(tokens, index + 1);
            return {
                node: { kind: 'compare', column: column.name, operator, value: value.value },
                next: value.next,
            };
        }
    } else if (token?.kind === 'word') {
        if (token.value === 'is') {
            index++;
            let negated = false;
            if (isWord(tokens[index], 'not')) {
                negated = true;
                index++;
            }
            if (isWord(tokens[index], 'distinct') && isWord(tokens[index + 1], 'from')) {
                const value = readValue(tokens, index + 2);
                const comp: WhereNode = {
                    kind: 'compare',
                    column: column.name,
                    operator: 'isDistinct',
                    value: value.value,
                };
                return {
                    node: negated ? { kind: 'not', child: comp } : comp,
                    next: value.next,
                };
            }
            if (!isWord(tokens[index], 'null')) throw new UnsupportedSqlError('`is` against a non-null value');
            return { node: { kind: 'is', column: column.name, negated }, next: index + 1 };
        }

        let notIn = false;
        let cursor = index;
        if (token.value === 'not' && isWord(tokens[index + 1], 'in')) {
            notIn = true;
            cursor = index + 2;
        } else if (token.value === 'in') {
            cursor = index + 1;
        }
        if (notIn || token.value === 'in') {
            if (!isPunct(tokens[cursor], '(')) throw new UnsupportedSqlError('`in` without a value list');
            cursor++;
            const values: SqlValue[] = [];
            for (;;) {
                const value = readValue(tokens, cursor);
                values.push(value.value);
                cursor = value.next;
                if (isPunct(tokens[cursor], ',')) {
                    cursor++;
                    continue;
                }
                break;
            }
            if (!isPunct(tokens[cursor], ')')) throw new UnsupportedSqlError('unterminated `in` value list');
            return { node: { kind: 'in', column: column.name, values, negated: notIn }, next: cursor + 1 };
        }

        if (token.value === 'like' || token.value === 'ilike') {
            const operator = token.value;
            const value = readValue(tokens, index + 1);
            return { node: { kind: 'compare', column: column.name, operator, value: value.value }, next: value.next };
        }
    }

    throw new UnsupportedSqlError(`unsupported operator in where near "${describe(token)}"`);
}
```
Note this is a straight reordering: every branch's body is byte-identical to the original, only the order of the checks and the top-level `if (token?.kind === 'punct') {...} else if (token?.kind === 'word') {...}` split changed. `readColumn`, `isWord`, `isPunct`, `describe`, `readValue`, `OPERATORS`, `TS_QUERY_TYPES` are unchanged.

- [ ] **Step 2: Run the full parse_where test file**

Run:
```bash
cd package && npx vitest run src/db/parse_where.test.ts
```
Expected: all PASS unchanged — every operator, `is`/`in`/`like` case, and every rejection case in `'rejects constructs PostgREST cannot express'` (in particular `'"a" % $1'`, which must still fall through to the final `throw` since `%` is a punct not in `OPERATORS`, and `'$1 = 1'`, which must still fail in `readColumn` before `parseComparison` is even reached).

- [ ] **Step 3: Run coverage for this file**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/parse_where.ts'
```
Expected: 100% statements/branches/functions/lines.

- [ ] **Step 4: Benchmark against the Task 1 (or Task 2-adjusted) baseline**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-after-where.txt
diff <(grep -A2 "Where clause parsing" /tmp/db-bench-baseline.txt) <(grep -A2 "Where clause parsing" /tmp/db-bench-after-where.txt)
```
Decision rule: keep the restructuring only if hz improves; if it's flat or worse, revert with `git checkout -- package/src/db/parse_where.ts` and note the measurement in the commit message — this function only runs once per *unique* statement shape (results are cached by `parse_statement.ts`'s `STATEMENT_CACHE`), so a small, unproven restructuring is not worth the added review risk on a Postgres-grammar parser.

- [ ] **Step 5: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add package/src/db/parse_where.ts
git commit -m "$(cat <<'EOF'
perf: dispatch parseComparison on token kind before keyword checks

<Fill in measured hz delta and keep/revert decision from Step 4. Note
that this path only runs once per unique statement shape, since
parseStatement caches parsed results — so any win here only affects
cache-miss latency, not steady-state throughput.>
EOF
)"
```

---

### Task 6: `rest_filters.ts` — switch-based dispatch

**Files:**
- Modify: `package/src/db/rest_filters.ts:66-147` (`applyWhere` and `serialize`)
- Test: `package/src/db/rest_filters.test.ts` (unchanged — correctness gate, including the `'throws for unknown where node kind in serialize and returns builder in applyWhere'` test that exercises the `default` branch via `{ kind: 'unknown' as never }`)

**Interfaces:**
- Consumes: `WhereNode`, `SqlValue`, `CompareOperator`, `FilterTarget`, `resolveValue`, `FILTER_CODES`, `TEXT_SEARCH_CODES`, `encodeFilterValue` (all unchanged).
- Produces: `applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T` and the internal `serialize` — same signatures, same call sequences to `builder`, same thrown errors, for every case in `rest_filters.test.ts`.

- [ ] **Step 1: Rewrite `applyWhere` with a `switch`**

In `package/src/db/rest_filters.ts`, replace:
```ts
export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T {
    if (node.kind === 'and') {
        for (const child of node.children) applyWhere(builder, child, params);
        return builder;
    }
    if (node.kind === 'or' || node.kind === 'not') {
        builder.or(serialize(node, params));
        return builder;
    }
    if (node.kind === 'is') {
        if (node.negated) builder.not(node.column, 'is', null);
        else builder.is(node.column, null);
        return builder;
    }
    if (node.kind === 'in') {
        const values = node.values.map((value) => resolveValue(value, params));
        if (node.negated) builder.not(node.column, 'in', values);
        else builder.in(node.column, values);
        return builder;
    }
    if (node.kind === 'textSearch') {
        const query = String(resolveValue(node.value, params));
        const opts: { type?: 'plain' | 'phrase' | 'websearch'; config?: string } = {};
        if (node.type) opts.type = node.type;
        if (node.config) opts.config = node.config;
        if (Object.keys(opts).length) builder.textSearch(node.column, query, opts);
        else builder.textSearch(node.column, query);
        return builder;
    }
    if (node.kind === 'compare') {
        builder[node.operator](node.column, resolveValue(node.value, params) as never);
        return builder;
    }
    return builder;
}
```
with:
```ts
export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T {
    switch (node.kind) {
        case 'and':
            for (const child of node.children) applyWhere(builder, child, params);
            return builder;
        case 'or':
        case 'not':
            builder.or(serialize(node, params));
            return builder;
        case 'is':
            if (node.negated) builder.not(node.column, 'is', null);
            else builder.is(node.column, null);
            return builder;
        case 'in': {
            const values = node.values.map((value) => resolveValue(value, params));
            if (node.negated) builder.not(node.column, 'in', values);
            else builder.in(node.column, values);
            return builder;
        }
        case 'textSearch': {
            const query = String(resolveValue(node.value, params));
            const opts: { type?: 'plain' | 'phrase' | 'websearch'; config?: string } = {};
            if (node.type) opts.type = node.type;
            if (node.config) opts.config = node.config;
            if (Object.keys(opts).length) builder.textSearch(node.column, query, opts);
            else builder.textSearch(node.column, query);
            return builder;
        }
        case 'compare':
            builder[node.operator](node.column, resolveValue(node.value, params) as never);
            return builder;
        default:
            return builder;
    }
}
```

- [ ] **Step 2: Rewrite `serialize` with a `switch`**

Replace:
```ts
function serialize(node: WhereNode, params: unknown[]): string {
    if (node.kind === 'and' || node.kind === 'or') {
        const children = node.children.map((child) => serialize(child, params)).join(',');
        return node.kind === 'and' ? `and(${children})` : children;
    }
    if (node.kind === 'not') return `not.${serialize(node.child, params)}`;
    if (node.kind === 'is') return node.negated ? `not.${node.column}.is.null` : `${node.column}.is.null`;
    if (node.kind === 'in') {
        const values = node.values.map((value) => encodeFilterValue(resolveValue(value, params))).join(',');
        const str = `${node.column}.in.(${values})`;
        return node.negated ? `not.${str}` : str;
    }
    if (node.kind === 'textSearch') {
        const code = node.type ? TEXT_SEARCH_CODES[node.type] : 'fts';
        const config = node.config ? `(${node.config})` : '';
        return `${node.column}.${code}${config}.${encodeFilterValue(resolveValue(node.value, params))}`;
    }
    if (node.kind === 'compare') {
        return `${node.column}.${FILTER_CODES[node.operator]}.${encodeFilterValue(resolveValue(node.value, params))}`;
    }
    throw new UnsupportedSqlError('unsupported where node');
}
```
with:
```ts
function serialize(node: WhereNode, params: unknown[]): string {
    switch (node.kind) {
        case 'and':
        case 'or': {
            const children = node.children.map((child) => serialize(child, params)).join(',');
            return node.kind === 'and' ? `and(${children})` : children;
        }
        case 'not':
            return `not.${serialize(node.child, params)}`;
        case 'is':
            return node.negated ? `not.${node.column}.is.null` : `${node.column}.is.null`;
        case 'in': {
            const values = node.values.map((value) => encodeFilterValue(resolveValue(value, params))).join(',');
            const str = `${node.column}.in.(${values})`;
            return node.negated ? `not.${str}` : str;
        }
        case 'textSearch': {
            const code = node.type ? TEXT_SEARCH_CODES[node.type] : 'fts';
            const config = node.config ? `(${node.config})` : '';
            return `${node.column}.${code}${config}.${encodeFilterValue(resolveValue(node.value, params))}`;
        }
        case 'compare':
            return `${node.column}.${FILTER_CODES[node.operator]}.${encodeFilterValue(resolveValue(node.value, params))}`;
        default:
            throw new UnsupportedSqlError('unsupported where node');
    }
}
```

- [ ] **Step 3: Run the full rest_filters test file**

Run:
```bash
cd package && npx vitest run src/db/rest_filters.test.ts
```
Expected: all PASS unchanged, including `'throws for unknown where node kind in serialize and returns builder in applyWhere'`.

- [ ] **Step 4: Run coverage for this file**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/rest_filters.ts'
```
Expected: 100% (the `switch`'s `default` case is hit by the existing "unknown kind" test, same as the old fallthrough `return`/`throw`).

- [ ] **Step 5: Benchmark against the baseline**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-after-filters.txt
diff <(grep -A2 "Where tree translation" /tmp/db-bench-baseline.txt) <(grep -A2 "Where tree translation" /tmp/db-bench-after-filters.txt)
```
Decision rule: keep if hz improves; if flat or worse, revert with `git checkout -- package/src/db/rest_filters.ts` and record why (V8's `switch` on string literals doesn't always beat a short `if`-chain when the chain is only 5-6 branches long — this is exactly the kind of case where measuring matters more than intuition).

- [ ] **Step 6: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add package/src/db/rest_filters.ts
git commit -m "$(cat <<'EOF'
perf: dispatch applyWhere/serialize with switch instead of if-chain

<Fill in measured hz delta and keep/revert decision from Step 5.>
EOF
)"
```

---

### Task 7: `rest_execute.ts` — manual loops instead of `.map()`/`Object.fromEntries()`

**Files:**
- Modify: `package/src/db/rest_execute.ts:25-85`
- Modify: `package/src/db/db_performance.bench.ts` (add an `executeRest` bench, currently absent)
- Test: `package/src/db/rest_execute.test.ts` (unchanged — correctness gate)

**Interfaces:**
- Consumes: `ParsedStatement`, `Projection`, `RestClient`, `RestQueryBuilder`, `RestQueryResult`, `applyWhere`, `resolveValue`, `UnsupportedSqlError` (all unchanged).
- Produces: `executeRest(client: RestClient, statement: ParsedStatement, params: unknown[]): Promise<{ rows: unknown[][]; rowCount: number | null }>` — same signature and output for every case in `rest_execute.test.ts`.

- [ ] **Step 1: Add an `executeRest` bench using the same stub pattern as its unit test**

In `package/src/db/db_performance.bench.ts`, add near the top (after the existing imports) a stub builder copied from `rest_execute.test.ts`'s `stubClient` helper, and a new `describe` block:
```ts
import executeRest from './rest_execute.js';
import type { RestClient } from './rest_client.js';

function stubRestClient(data: unknown) {
    const builder: Record<string, unknown> = {};
    const proxy = new Proxy(builder, {
        get(_target, method: string) {
            if (method === 'then') {
                return (onfulfilled: (value: unknown) => unknown) =>
                    Promise.resolve(onfulfilled({ data, error: null, count: Array.isArray(data) ? data.length : null }));
            }
            return () => proxy;
        },
    });
    return { from: () => proxy, rpc: () => proxy } as unknown as RestClient;
}
```
then, alongside the other `describe` blocks:
```ts
    describe('executeRest', () => {
        const selectClient = stubRestClient([
            { id: 1, name: 'a', email: 'a@x.com' },
            { id: 2, name: 'b', email: 'b@x.com' },
            { id: 3, name: 'c', email: 'c@x.com' },
        ]);
        const selectStatement = {
            kind: 'select' as const,
            table: 'users',
            projection: [{ column: 'id' }, { column: 'name' }, { column: 'email' }],
            orderBy: [],
        };

        const insertClient = stubRestClient([{ id: 7 }]);
        const insertStatement = {
            kind: 'insert' as const,
            table: 'users',
            columns: ['name', 'email'],
            rows: [
                [{ kind: 'literal' as const, value: 'John Doe' }, { kind: 'literal' as const, value: 'john@example.com' }],
                [{ kind: 'literal' as const, value: 'Jane Doe' }, { kind: 'literal' as const, value: 'jane@example.com' }],
            ],
            returning: [{ column: 'id' }],
        };

        bench('Select with 3-row result', async () => {
            await executeRest(selectClient, selectStatement, []);
        });

        bench('Insert with 2 rows', async () => {
            await executeRest(insertClient, insertStatement, []);
        });
    });
```

- [ ] **Step 2: Run the bench to capture a baseline for this new group**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-execute-baseline.txt
```

- [ ] **Step 3: Replace `.map()`/`Object.fromEntries()` row-shaping with manual loops**

In `package/src/db/rest_execute.ts`, change the insert-values construction from:
```ts
    } else if (statement.kind === 'insert') {
        const values = statement.rows.map((row) =>
            Object.fromEntries(statement.columns.map((column, index) => [column, resolveValue(row[index]!, params)])),
        );
```
to:
```ts
    } else if (statement.kind === 'insert') {
        const values = new Array<Record<string, unknown>>(statement.rows.length);
        for (let r = 0; r < statement.rows.length; r++) {
            const row = statement.rows[r]!;
            const record: Record<string, unknown> = {};
            for (let c = 0; c < statement.columns.length; c++) {
                record[statement.columns[c]!] = resolveValue(row[c]!, params);
            }
            values[r] = record;
        }
```
and change the update-values construction from:
```ts
    } else if (statement.kind === 'update') {
        const values = Object.fromEntries(
            Object.entries(statement.set).map(([column, value]) => [column, resolveValue(value, params)]),
        );
```
to:
```ts
    } else if (statement.kind === 'update') {
        const values: Record<string, unknown> = {};
        for (const column of Object.keys(statement.set)) {
            values[column] = resolveValue(statement.set[column]!, params);
        }
```
and change the result row-shaping from:
```ts
    const rows = (data ?? []).map((row) =>
        projectionOf(projection).map(({ column, alias }) => {
            const val = (alias ? row[alias] : undefined) ?? row[column];
            return val ?? null;
        }),
    );
```
to:
```ts
    const resultRows = data ?? [];
    const columns = projectionOf(projection);
    const rows = new Array<unknown[]>(resultRows.length);
    for (let r = 0; r < resultRows.length; r++) {
        const row = resultRows[r]!;
        const shaped = new Array<unknown>(columns.length);
        for (let c = 0; c < columns.length; c++) {
            const { column, alias } = columns[c]!;
            const val = (alias ? row[alias] : undefined) ?? row[column];
            shaped[c] = val ?? null;
        }
        rows[r] = shaped;
    }
```

- [ ] **Step 4: Run the full rest_execute test file**

Run:
```bash
cd package && npx vitest run src/db/rest_execute.test.ts
```
Expected: all PASS unchanged, in particular `'runs a select and returns positional rows in projection order'`, `'inserts rows and returns the returning projection'`, `'maps on conflict do nothing and do update onto upsert'`, `'treats a missing column in a returned row as null'`.

- [ ] **Step 5: Run coverage for this file**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/rest_execute.ts'
```
Expected: 100% statements/branches/functions/lines.

- [ ] **Step 6: Benchmark against the Step 2 baseline**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-execute-after.txt
diff <(grep -A5 "executeRest" /tmp/db-bench-execute-baseline.txt) <(grep -A5 "executeRest" /tmp/db-bench-execute-after.txt)
```
Decision rule: keep if hz improves for both cases; if flat or worse, revert with `git checkout -- package/src/db/rest_execute.ts` (keep the bench additions from Step 1 either way — they are the real deliverable if the loop rewrite doesn't pay off, since this module previously had zero bench coverage) and record the measurement in the commit message.

- [ ] **Step 7: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add package/src/db/rest_execute.ts package/src/db/db_performance.bench.ts
git commit -m "$(cat <<'EOF'
perf: bench executeRest row-shaping, <keep|revert> manual-loop rewrite

rest_execute.ts had no benchmark coverage at all. Added one using the
same stub pattern as rest_execute.test.ts. <Fill in measured hz delta
and keep/revert decision from Step 6.>
EOF
)"
```

---

### Task 8: `connection.ts` and `context.ts` — targeted hoists, no new benchmarks

**Files:**
- Modify: `package/src/db/connection.ts:76-84`
- Modify: `package/src/db/context.ts:261-264`
- Test: `package/src/db/connection.test.ts`, `package/src/db/context.test.ts` (unchanged — correctness gate)

**Interfaces:** unchanged in both files — this task only moves code, it does not touch any exported function's signature or behavior.

Both files are dominated by `await`ed I/O (`client.connect()`, `rawClient.query(...)`, dynamic `import()`s, `getCloudflareContext()`), which a mocked vitest bench cannot measure meaningfully — it would only clock the mock's promise-resolution overhead, not anything representative of real Postgres/PostgREST latency. Rather than add benchmark theater for these two files, this task fixes the two concrete, low-risk CPU inefficiencies that inspection turned up, gated purely by the existing unit tests (which already mock `pg`/`drizzle` and assert exact call sequences).

- [ ] **Step 1: Hoist the connect-error classifier regex to module scope in `connection.ts`**

In `package/src/db/connection.ts`, change:
```ts
        try {
            await client.connect();
            connected = true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? '');
            if (!/(connection terminated|connection closed|socket closed|unexpected eof)/i.test(message)) {
                void reportError(
                    { errorHandling: config.errorHandling, generate: config.generate },
                    { error, classOrMethodName: 'db.withDbClient.connectError' }
                );
            }
            throw error;
        }
```
to reference a module-level constant. Add near the top of the file, after the imports:
```ts
const BENIGN_DISCONNECT_PATTERN = /(connection terminated|connection closed|socket closed|unexpected eof)/i;
```
and change the usage to:
```ts
        try {
            await client.connect();
            connected = true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? '');
            if (!BENIGN_DISCONNECT_PATTERN.test(message)) {
                void reportError(
                    { errorHandling: config.errorHandling, generate: config.generate },
                    { error, classOrMethodName: 'db.withDbClient.connectError' }
                );
            }
            throw error;
        }
```
This only matters on the connect-failure path (rare), and the win is negligible either way since JS engines already reuse a regex literal's compiled form across evaluations of the same source position — this is a readability/clarity change more than a perf one, being made here because it was noticed during the review pass, not because a benchmark asked for it.

- [ ] **Step 2: Run the connection test file**

Run:
```bash
cd package && npx vitest run src/db/connection.test.ts
```
Expected: all PASS unchanged.

- [ ] **Step 3: Hoist `context.ts`'s non-capturing `isSelectOnly` helper to module scope**

In `package/src/db/context.ts`, this closure is defined fresh inside `withUserDb` on every call, but it captures nothing from the enclosing scope:
```ts
        const isSelectOnly = (sql: unknown): boolean => {
            const text = typeof sql === 'string' ? sql : (sql as { text?: unknown })?.text;
            return typeof text === 'string' && /^(select|with)\b/i.test(text.trimStart());
        };
```
Move it out of `withUserDb`, to module scope (near `injectUidComment`, which is already module-level), unchanged:
```ts
function isSelectOnly(sql: unknown): boolean {
    const text = typeof sql === 'string' ? sql : (sql as { text?: unknown })?.text;
    return typeof text === 'string' && /^(select|with)\b/i.test(text.trimStart());
}
```
and delete the inline `const isSelectOnly = ...` from inside `withUserDb`. Every call site (`isSelectOnly(sql)` inside the `interceptingClient` Proxy's `query` trap) is unaffected, since the function's behavior and the values it closes over (none) are unchanged.

- [ ] **Step 4: Run the context test file**

Run:
```bash
cd package && npx vitest run src/db/context.test.ts
```
Expected: all PASS unchanged.

- [ ] **Step 5: Run coverage for both files**

Run:
```bash
cd package && npm test -- --coverage.include='src/db/connection.ts' --coverage.include='src/db/context.ts'
```
Expected: 100% statements/branches/functions/lines for both.

- [ ] **Step 6: Run the full test suite**

Run:
```bash
cd package && npm test
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add package/src/db/connection.ts package/src/db/context.ts
git commit -m "$(cat <<'EOF'
refactor: hoist a regex constant and a non-capturing closure in db/connection and db/context

Both modules are I/O-dominated (pg connect/query, dynamic imports), so
a mocked benchmark here would only measure mock overhead, not anything
representative — no bench added. These two hoists remove per-call
allocation (a closure recreated on every withUserDb call that captures
nothing) and clarify a previously-inline regex; no behavior change.
EOF
)"
```

---

### Task 9: Full verification and summary

**Files:** none modified — this task only runs verification and writes the final summary.

- [ ] **Step 1: Run the full test suite with coverage**

Run:
```bash
cd package && npm test
```
Expected: every test file passes, and every per-file coverage threshold in `vitest.config.ts` (100% statements/branches/functions/lines for everything under `src/**` except the two pre-existing documented exceptions unrelated to `db`) is met.

- [ ] **Step 2: Run the full bench suite one final time**

Run:
```bash
cd package && npm run bench 2>&1 | tee /tmp/db-bench-final.txt
```

- [ ] **Step 3: Diff the final numbers against the Task 1 baseline for every group**

Run:
```bash
diff /tmp/db-bench-baseline.txt /tmp/db-bench-final.txt
```
Note in the final summary which groups improved, by roughly how much (hz or mean time), and which optimizations were tried and reverted (from Tasks 3-8's decision points) with the measured reason why.

- [ ] **Step 4: Run the type checker and linter, if present**

Run:
```bash
cd package && npm run build 2>&1 | tail -30
```
Expected: `tsc` succeeds with no new errors (the `build` script runs `tsc` as part of compiling `dist`).

- [ ] **Step 5: Final commit (if any cleanup is needed)**

If Steps 1-4 required no further code changes, this step is a no-op — the work is already committed task-by-task. If any fix-up was needed, commit it:
```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: final verification pass for db module perf work

Full test suite green, 100% coverage maintained per-file, full bench
suite re-run and diffed against the pre-work baseline.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** All nine named modules (`sql_tokens`, `parse_statement`, `parse_where`, `inline_params`, `encode_param`, `rest_filters`, `connection`, `context`, `rest_execute`) are addressed — `parse_statement` via Task 2's verification (it already caches by reference; the risk was `sql_tokens`'s copy, now removed) and `connection`/`context` via Task 8's targeted, benchmark-honest scope. `db_performance.bench.ts` itself is fixed (Task 1) and extended (Tasks 4 and 7) to actually cover what's being changed.
- **Byte/behavior identity:** every task's correctness gate is the module's existing exhaustive test file, which already asserts exact output (`toBe`/`toEqual`) for every branch — no test file needed new cases for behavior changes, because no task changes behavior; the one new test (Task 2, Step 1) locks in a new *non-behavioral* guarantee (reference reuse).
- **100% coverage:** every task includes a per-file coverage run before the final full-suite run, and Tasks that add branches (Task 3's manual dollar-quote scan, Task 6's `switch` statements) explicitly cross-reference which existing test case exercises each new branch.
- **Honesty about wins:** Tasks 3, 4, 5, 6, and 7 each include an explicit "measure, then keep-or-revert" decision point with a `git checkout` escape hatch, so the plan cannot be executed on autopilot into shipping an unproven or harmful change — matching the precedent already set in this codebase's `image_optimizer` perf work (commit `4e81101`).

# Auto-Tracked Firebase Performance Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `package/src/firebase_auth/client/components/auto_firebase_performance_events.tsx`
(currently: Web Vitals → Firebase Performance custom traces, auto-wired,
already implemented) to auto-track every additional performance signal that
Firebase's own automatic instrumentation (page load, fetch/XHR network
requests) does NOT already cover, with zero consumer steps beyond
`firebaseAuth` being configured — same as Web Vitals already works.

**Context / prior decision this plan overrides:** `.agent/.sub-rules/packages/firebase-auth.md`
and `package/src/firebase_auth/README.md` both currently document a
deliberate "no exported performance client, no auto-wired custom traces —
consumer calls `trace()` themselves" policy, predating this plan. The user
was shown this conflict directly and chose to override it (session
transcript, 2026-08-19): keep the auto-wired component and getter already
added this session, and build more auto-tracked signals on top of it. Task 4
below brings both docs in line with this ruling — do not re-litigate it.

**New signals added by this plan** (all via the SAME component, mirroring
`cookie_consent/client/components/auto_analytics_events.tsx`'s one-file,
multi-signal pattern):

1. SPA route-change duration (Firebase's automatic page-load trace only
   fires once per hard navigation; Next.js App Router client-side
   navigations never re-trigger it — this is a real coverage gap).
2. Main-thread long tasks (`PerformanceObserver('longtask')`) — not
   collected by Firebase's automatic traces at all.
3. Slow non-fetch/XHR resource loads (`PerformanceObserver('resource')`,
   `initiatorType` other than `fetch`/`xmlhttprequest`) — Firebase's network
   monitoring only instruments `fetch`/`XMLHttpRequest`; images, scripts,
   stylesheets, fonts loaded declaratively are never observed.

**Tech Stack:** Firebase Performance (`firebase/performance`'s `trace()`
+ `.record()`), `next/navigation`'s `usePathname`, `next/web-vitals`'s
`useReportWebVitals` (all already used), `PerformanceObserver` (browser API,
`typeof window`-guarded). Vitest + `@testing-library/react` for tests,
following `firebase_auth/client/firebase_client.test.ts`'s `firebase/performance`
mock and `cookie_consent/client/components/cookie_consent_analytics.test.tsx`'s
render pattern.

## Global Constraints

- Everything in this plan is gated on the SAME single flag already in place:
  `fa.performance !== false` (checked indirectly — `getFirebasePerformanceSync()`
  returns `undefined` when disabled, and every new code path must no-op in
  that case, exactly like the existing Web Vitals block does). Do **not**
  add new per-signal opt-out flags/config — single toggle, zero extra
  consumer surface, per the user's explicit ask.
- `firebase/performance` stays dynamically `import()`-ed inside function
  bodies only — never a static top-level import (existing repo rule, see
  `.agent/.sub-rules/packages/firebase-auth.md`'s Isolation rules section;
  applies to this component too even though it lives outside `firebase_auth/**`'s
  strict isolation zone — it's still inside `firebase_auth/client/`).
- All new `PerformanceObserver` usage must feature-detect before
  constructing: `typeof PerformanceObserver !== 'undefined' &&
  PerformanceObserver.supportedEntryTypes?.includes(<type>)`. Some browsers
  (Safari) don't support `'longtask'`; never let a missing entry type throw.
- Every new observer must be registered once (module-scope-safe: stays
  inside a `useEffect` with `[]` deps, or a ref-guarded singleton) — never
  re-registered on every render, and always cleaned up (`observer.disconnect()`)
  on unmount.
- Firebase trace names/attribute keys must be short, stable, snake_case
  ASCII strings (Firebase Performance's own limits: trace name ≤100 chars,
  attribute value ≤100 chars) — truncate any user-controlled string (a
  resource URL) before passing it as an attribute value.
- Tests required for all new logic (repo-wide convention). Run from
  `package/`: `cd package && npx vitest run src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx`.
  The `typeof window` guards need the jsdom environment — running vitest
  from the repo root instead of `package/` silently uses the wrong config
  and these tests fail misleadingly (documented gotcha, see
  `.agent/.sub-rules/packages/firebase-auth.md`).
- `npx tsc --noEmit -p tsconfig.json` (run from `package/`) must pass with
  zero errors after every task.
- Do not touch `client_provider_static.tsx` / `server_provider_static.tsx` —
  the static (`output: 'export'`) build path deliberately excludes all of
  `firebase_auth/**` (see existing comment in `client_provider_static.tsx`);
  this plan's component is only ever wired through the non-static
  `client_provider.tsx`, which already renders it (done, prior session).

---

### Task 1: Shared trace helper + route-change duration trace

**Files:**

- Modify: `package/src/firebase_auth/client/components/auto_firebase_performance_events.tsx`
- Create: `package/src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx`

**Interfaces:**

- Produces: a module-private async helper
  `recordFirebaseTrace(name: string, durationMs: number, attributes?: Record<string, string>, metrics?: Record<string, number>): Promise<void>`
  — awaits `getFirebaseAuthClient()`, reads `getFirebasePerformanceSync()`,
  returns early (no-op) if `undefined`, dynamically imports `firebase/performance`,
  and calls `trace(performance, name).record(Date.now() - Math.max(Math.round(durationMs), 1), Math.max(Math.round(durationMs), 1), { attributes, metrics })`.
  Tasks 2 and 3 both call this helper — it must be written first.
- Consumes: `getFirebaseAuthClient`, `getFirebasePerformanceSync` (already
  exported from `../firebase_client`, already imported in this file).

- [ ] **Step 1: Add the shared helper, refactor the existing Web Vitals block to use it**

Replace the current inline `useReportWebVitals` body (which duplicates the
`getFirebaseAuthClient()` + `getFirebasePerformanceSync()` + dynamic-import
+ `trace(...).record(...)` sequence) with a call to the new shared helper.
Use the metric's own value (already computed as `value`, CLS ×1000'd to an
integer, matching the existing `formatMetricValue` convention from
`cookie_consent/client/components/auto_analytics_events.tsx`) AS the trace's
`durationMs` argument — this makes Firebase Performance's own duration
histograms/percentiles meaningful for each Web Vitals metric, instead of the
placeholder `duration: 1` the current code passes. Keep `rating` as an
attribute. Final shape of the Web Vitals block:

```tsx
useReportWebVitals((metric: WebVitalMetric) => {
    const value = Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value);
    void recordFirebaseTrace(`web_${metric.name.toLowerCase()}`, value, { rating: metric.rating });
});
```

- [ ] **Step 2: Route-change duration trace**

Add a `usePathname()`-driven `useEffect` (same import source as
`cookie_consent/client/components/auto_analytics_events.tsx`:
`from 'next/navigation'`) that measures wall-clock time between path
changes and records it as trace name `'route_change'`, attribute
`{ path }`. Skip the very first mount (that's the initial page load, not a
navigation — already covered by Firebase's own automatic page-load trace,
and the elapsed time at first mount is not meaningful). Use a ref-based
"is this the first render" flag, standard React pattern (see any existing
`useRef`-guarded first-mount skip in this repo, e.g. search
`isFirstRender`/`useRef(true)` if one already exists, otherwise write it
inline):

```tsx
const path = usePathname();
const isFirstRoute = useRef(true);
const lastRouteChangeRef = useRef(Date.now());

useEffect(() => {
    const now = Date.now();
    const duration = now - lastRouteChangeRef.current;
    lastRouteChangeRef.current = now;
    if (isFirstRoute.current) {
        isFirstRoute.current = false;
        return;
    }
    void recordFirebaseTrace('route_change', duration, { path });
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [path]);
```

Note in a code comment that this measures time between path-change commits
as an approximation of navigation duration (App Router exposes no public
"navigation start" event this package can hook into) — do not overstate
precision.

- [ ] **Step 3: Tests**

Create `auto_firebase_performance_events.test.tsx` modeled on
`firebase_auth/client/firebase_client.test.ts`'s `firebase/performance` mock
(`getPerformance`, `vi.mock('firebase/performance', ...)`, also mock the
module's `trace` export with a `record` spy) combined with
`cookie_consent/client/components/cookie_consent_analytics.test.tsx`'s
`@testing-library/react` render pattern. Also mock `next/navigation`'s
`usePathname` (return a controllable value, e.g. a `let currentPath` module
variable the test reassigns before re-rendering) and `next/web-vitals`'s
`useReportWebVitals` (capture the callback passed to it so the test can
invoke it directly with a fake metric, same technique
`cookie_consent_analytics.test.tsx` / `auto_analytics_events.tsx`'s own
future tests would use — check if `next/web-vitals` needs a `vi.mock` stub;
if the real module works fine under jsdom without a DOM `PerformanceObserver`
for web-vitals, it's fine to only mock it if it errors under jsdom without a
browser environment).

Cover:
- `getFirebasePerformanceSync()` returns `undefined` (performance disabled)
  → no `trace()` call for either Web Vitals or route-change.
- `getFirebasePerformanceSync()` returns an instance → a Web Vitals metric
  triggers `trace(performance, 'web_lcp')` (or similar) and `.record(...)`
  with the rounded value as duration and `{ rating }` as attributes.
- First render does NOT fire a `route_change` trace.
- A path change (rerender with a different `usePathname()` mock value) DOES
  fire `trace(performance, 'route_change')` with `{ path: <new path> }`.

- [ ] **Step 4: Verify**

```bash
cd package && npx tsc --noEmit -p tsconfig.json && npx vitest run src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx
```

Commit: `feat: add shared Firebase trace helper and route-change duration tracking`

---

### Task 2: Long-task (main-thread blocking) monitoring

**Files:**

- Modify: `package/src/firebase_auth/client/components/auto_firebase_performance_events.tsx`
- Modify: `package/src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx`

**Interfaces:**

- Consumes: `recordFirebaseTrace` (Task 1).
- Produces: no new exports — purely additive behavior inside the same
  default-exported component.

- [ ] **Step 1: Long-task observer**

Add a `useEffect` (mount-only, `[]` deps) that, when supported, registers a
`PerformanceObserver` for `'longtask'` entries, accumulating count + total
duration in a `useRef` (not state — no re-render needed), and flush that
accumulator as a Firebase trace whenever the route changes (reuse the SAME
`path`-keyed effect from Task 1's Step 2, or a second effect keyed on
`[path]` — either is fine, but the flush must happen on route change, not
on every long task, to keep trace volume bounded to one-per-route instead of
one-per-long-task). Skip emitting a trace when the accumulator's count is 0
(no long tasks on this route — don't emit noise). Trace name
`'route_long_tasks'`, `durationMs` = accumulated total duration, metric
`{ long_task_count: count }`, attribute `{ path }`.

```tsx
const longTaskStats = useRef({ count: 0, totalDuration: 0 });

useEffect(() => {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            longTaskStats.current.count += 1;
            longTaskStats.current.totalDuration += entry.duration;
        }
    });
    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
}, []);
```

Flush block (extend the Task 1 route-change effect — do not duplicate the
`path`-change detection logic, add this as a second statement inside the
SAME effect body, after the existing `route_change` trace call):

```tsx
const { count, totalDuration } = longTaskStats.current;
longTaskStats.current = { count: 0, totalDuration: 0 };
if (count > 0) {
    void recordFirebaseTrace('route_long_tasks', totalDuration, { path }, { long_task_count: count });
}
```

Place this flush so it also runs once on unmount (final route's
accumulated long tasks shouldn't be silently dropped) — add a
cleanup-time flush in the mount-only observer effect's own return function
using the ref's current value at unmount time, OR accept that the final
route's tail long-tasks are lost (document the tradeoff in a code comment
rather than adding complexity for it — this is a monitoring signal, not a
billing metric, an occasional dropped tail sample is acceptable). Prefer
the simpler documented-tradeoff option unless it takes under 5 extra lines
to do properly.

- [ ] **Step 2: Tests**

Extend the test file: mock `PerformanceObserver` as a jsdom-safe fake
(jsdom does not implement it natively) with a controllable `observe`/
`disconnect` and a way for the test to synthesously push a `longtask` entry
into the registered callback. Cover:
- `PerformanceObserver` unsupported (`supportedEntryTypes` missing/doesn't
  include `'longtask'`) → component doesn't throw, no observer constructed.
- One or more long-task entries pushed, then a route change → `trace(performance, 'route_long_tasks')`
  fires with the summed duration and correct `long_task_count`.
- No long-task entries, route changes → no `route_long_tasks` trace (count
  stays 0).

- [ ] **Step 3: Verify**

```bash
cd package && npx tsc --noEmit -p tsconfig.json && npx vitest run src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx
```

Commit: `feat: add long-task monitoring to auto Firebase performance tracking`

---

### Task 3: Slow non-fetch/XHR resource monitoring

**Files:**

- Modify: `package/src/firebase_auth/client/components/auto_firebase_performance_events.tsx`
- Modify: `package/src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx`

**Interfaces:**

- Consumes: `recordFirebaseTrace` (Task 1).
- Produces: a module-private constant `SLOW_RESOURCE_THRESHOLD_MS = 1000`
  (exported from nowhere, local to this file — do not add this as
  consumer-facing config per the Global Constraints' single-toggle rule).

- [ ] **Step 1: Resource observer**

Add a second mount-only (`[]` deps) `PerformanceObserver`, entry type
`'resource'`, `buffered: true` (catch resources that loaded before this
component mounted — this component only mounts after `AuthUserProvider`,
so plenty of head-of-page resources will have already finished). For each
entry:

- Skip if `entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest'`
  (Firebase Performance's own automatic network monitoring already
  instruments these — this observer exists to fill the gap Firebase leaves,
  not duplicate it).
- Skip if `entry.duration < SLOW_RESOURCE_THRESHOLD_MS`.
- Otherwise record trace `'slow_resource'`, `durationMs = entry.duration`,
  attributes `{ initiator_type: entry.initiatorType, resource: <truncated URL> }`,
  metric `{ transfer_size_bytes: Math.round(entry.transferSize ?? 0) }`.
  Truncate the URL to the last 100 characters (Firebase's attribute-value
  length cap — see Global Constraints) using
  `entry.name.slice(-100)` so the meaningful tail (path/filename) survives
  truncation rather than the origin.

```tsx
useEffect(() => {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('resource')) return;
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') continue;
            if (entry.duration < SLOW_RESOURCE_THRESHOLD_MS) continue;
            void recordFirebaseTrace('slow_resource', entry.duration, {
                initiator_type: entry.initiatorType,
                resource: entry.name.slice(-100),
            }, { transfer_size_bytes: Math.round(entry.transferSize ?? 0) });
        }
    });
    observer.observe({ type: 'resource', buffered: true });
    return () => observer.disconnect();
}, []);
```

- [ ] **Step 2: Tests**

Extend the same `PerformanceObserver` mock infrastructure from Task 2 (or
generalize it to support multiple concurrently-registered observers with
different entry types, dispatching pushed entries only to observers of the
matching type). Cover:
- A `fetch`-initiated resource entry over threshold → no trace (excluded,
  Firebase's own network monitoring covers it).
- A `script`/`img` (non-fetch) entry under threshold → no trace.
- A `script` entry over threshold → `trace(performance, 'slow_resource')`
  fires with `initiator_type: 'script'` and the (possibly truncated) URL.
- A resource URL longer than 100 chars → attribute value is the last 100
  characters of the original.

- [ ] **Step 3: Verify**

```bash
cd package && npx tsc --noEmit -p tsconfig.json && npx vitest run src/firebase_auth/client/components/auto_firebase_performance_events.test.tsx
```

Commit: `feat: add slow non-fetch resource monitoring to auto Firebase performance tracking`

---

### Task 4: Documentation — bring both docs in line with the override ruling

**Files:**

- Modify: `.agent/.sub-rules/packages/firebase-auth.md`
- Modify: `package/src/firebase_auth/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Rewrite `.agent/.sub-rules/packages/firebase-auth.md`'s "Performance Monitoring" section**

Replace the paragraph starting "There is deliberately **no exported
performance client**..." through "...import `trace()` from
`firebase/performance` directly against the app from `getFirebaseAuthClient()`."
(currently lines 68–75) with an accurate description of the CURRENT state:

- `getFirebasePerformanceSync()` IS exported from `firebase_client.ts` (and
  re-exported from `firebase_auth/index.ts`) — state why: it backs the
  auto-wired `AutoFirebasePerformanceEvents` component
  (`client/components/auto_firebase_performance_events.tsx`), rendered
  automatically by `client_provider.tsx`'s `LocationzationClientProvider`
  whenever `config.firebaseAuth` is set and `firebaseAuth.performance !==
  false` — zero consumer steps, same as the Web Vitals → GA `AutoAnalyticsEvents`
  pattern in `cookie_consent/`.
- List every signal that component now auto-tracks as a Firebase
  Performance custom trace: Web Vitals (`web_cls`/`web_fcp`/`web_fid`/
  `web_lcp`/`web_ttfb`/`web_inp`), SPA route-change duration
  (`route_change`), main-thread long tasks (`route_long_tasks`), slow
  non-fetch/XHR resource loads (`slow_resource`).
- State explicitly that this supersedes the module's earlier
  no-exported-getter stance — one line, no need to narrate the history in
  depth, this doc is guidance for future agents, not a changelog.
- Update the "Tests" paragraph at the bottom of that section to point at
  `client/components/auto_firebase_performance_events.test.tsx` in addition
  to the existing `firebase_client.test.ts` reference.

- [ ] **Step 2: Rewrite `package/src/firebase_auth/README.md`'s "Performance Monitoring" section**

Same content shift, README-length (shorter, consumer-facing — this file
already reads like end-user docs, keep that register). Replace "No
performance client is exported..." through "...using the `app` from
`getFirebaseAuthClient()`." with: `AutoFirebasePerformanceEvents` is
auto-rendered and auto-tracks Web Vitals, SPA route-change duration,
long tasks, and slow non-fetch resource loads as Firebase Performance
custom traces — nothing for the consumer to render or call, same as the
page-load/network traces above it. One short paragraph is enough; this
README doesn't need the full signal-by-signal breakdown the sub-rules doc
gets.

- [ ] **Step 3: Verify**

Read both edited sections back and confirm no other section of either file
still references "no exported performance client" (grep both files for
`"exported performance"` and `"no.*getter"` case-insensitively to confirm
zero remaining hits).

Commit: `docs: update firebase-auth docs for auto-tracked performance signals`

# Auth Login Bounce + SSR Auth Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the header profile icon from bouncing `/login` → `/`, and make auth forms server-render their fields/buttons (disabled until interactive) instead of an empty card.

**Architecture:** Two root causes, both in `cloudflare-next-intl`:
1. `update_session.ts` redirects an auth page to `homePath` on cookie-only evidence (unverified JWT `exp` check or a refresh-token mint). The client Firebase SDK may disagree (signed out), so the header keeps linking to `/login` and the middleware keeps bouncing. Fix: middleware stops redirecting auth pages home; the client `AuthUserProvider` (which already redirects signed-in users off auth pages from the live SDK) is the single authority, and clears stale server cookies when the SDK resolves to null on an auth page.
2. `IntlProvider` wraps the `next/dynamic` client provider in `<Suspense fallback={children}>`. When it suspends during SSR, `children` render without `LocaleContext`, so `useLocale`/`useTranslations` throw, and each auth page's bare `<Suspense>` emits a `null` fallback. Fix: provide `LocaleContext` from a small statically-imported client component outside that Suspense. App side: forms render with `<fieldset disabled>` until hydrated.

**Tech Stack:** Next.js 16 / vinext, React 19, TypeScript, vitest, Firebase Auth client SDK.

**Spec:** Root-cause reports in session (no separate spec doc). Symptoms: prod network log `GET /login?_rsc 307 → GET / 200` on every profile-icon tap; auth forms empty on first paint.

## Global Constraints

- Package path: `/Volumes/External/own_projects/cloudflare-next-intl/packages/cloudflare-next-intl`; app path: `/Volumes/External/own_projects/inflalite`.
- Use `rtk <cmd>` for all CLI tools.
- No comments in new code; targeted edits only; named imports only (no `import * as`).
- Tailwind lengths in `rem` only; no hardcoded user-facing strings.
- App consumes the package from npm — ship package changes as a new version (current `0.10.21`) before app verification.

## Review Focus

1. Signed-in user with a **valid** session opens `/login` directly → must still end up on `homePath` (now via client redirect, not middleware). Test in Task 3.
2. Signed-out user with a **stale unexpired session cookie** opens `/login` → page renders, stale httpOnly cookies are cleared, no loop. Tests in Task 2 + Task 3.
3. Unverified signed-in user on `/login` → still redirected to `verifyEmailPath` by middleware (branch above the changed one must stay). Test in Task 2.
4. Page outside any auth path whose client provider chunk suspends → `useTranslations` still works in SSR. Test in Task 1.
5. Form submit before hydration → impossible (fields/button disabled), no double submit after hydration. Test in Task 4.

---

### Task 1: Provide `LocaleContext` outside the lazy client provider

**Files:**
- Create: `src/client/components/locale_provider.tsx`
- Modify: `src/client/components/client_provider.tsx:17-22` (move `LocaleContext` out, re-export)
- Modify: `src/server/components/server_provider.tsx:178` (wrap Suspense)
- Test: `src/client/components/locale_provider.test.tsx`

**Interfaces:**
- Produces: `export const LocaleContext` (same type as today) and `export default function LocaleProvider({ language, messages, children }: { language: string; messages: TranslationObject; children: ReactNode }): JSX.Element` from `locale_provider.tsx`. `client_provider.tsx` keeps `export { LocaleContext } from "./locale_provider.js"` so existing imports (`client_hooks.ts`) keep working.

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToString } from "react-dom/server";
import { Suspense, lazy } from "react";
import { describe, expect, it } from "vitest";
import LocaleProvider from "./locale_provider.js";
import { useLocale, useTranslations } from "../hooks/client_hooks.js";

function Consumer() {
    const t = useTranslations("A");
    return <span>{useLocale()}:{t("b")}</span>;
}

const Never = lazy(() => new Promise<never>(() => {}));

describe("LocaleProvider", () => {
    it("keeps hooks working when the lazy client provider suspends in SSR", () => {
        const html = renderToString(
            <LocaleProvider language="uk" messages={{ A: { b: "ok" } }}>
                <Suspense fallback={<Consumer />}><Never /></Suspense>
            </LocaleProvider>,
        );
        expect(html).toContain("uk:ok");
    });
});
```

- [ ] **Step 2: Run** `rtk npx vitest run src/client/components/locale_provider.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`locale_provider.tsx`:
```tsx
"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { TranslationObject } from "../../types/types.js";

interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}

export const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export default function LocaleProvider({ language, messages, children }: { language: string; messages: TranslationObject; children: ReactNode }): React.JSX.Element {
    const value = useMemo(() => ({ language, messages }), [language, messages]);
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
```

In `client_provider.tsx` delete the `LocaleContextType` interface + `createContext` line, add `import { LocaleContext } from "./locale_provider.js";` and `export { LocaleContext };`. Leave its own `<LocaleContext.Provider>` in place (inner provider wins after hydration; identical value).

In `server_provider.tsx` add `import LocaleProvider from "../../client/components/locale_provider.js";` and wrap the return:
```tsx
return (
    <LocaleProvider language={language} messages={messagesValue}>
        <Suspense fallback={children}>
            {/* existing LocationzationClientProvider unchanged */}
        </Suspense>
    </LocaleProvider>
);
```

- [ ] **Step 4: Run** the new test + `rtk npx vitest run src/client src/server` — Expected: PASS.
- [ ] **Step 5: Commit** `fix: provide LocaleContext outside lazy client provider for SSR`

---

### Task 2: Middleware stops sending auth pages home on cookie-only evidence

**Files:**
- Modify: `src/firebase_auth/middleware/update_session.ts:508-523`
- Test: `src/firebase_auth/middleware/update_session.test.ts`

**Interfaces:** none new. Behavior: signed-in-by-cookie request to an `isAuthPath` page → `baseResponse` (200). `verifyEmailPath` + explicit `email_verified === true` → still redirect home. `unverifiedEmail` branch unchanged.

- [ ] **Step 1: Write failing test** — in `update_session.test.ts`, find the existing test asserting "signed-in user on auth page redirects to homePath" (`rtk grep -n "homePath" src/firebase_auth/middleware/update_session.test.ts`). Change its expectation and rename it:

```ts
it("serves an auth page to a cookie-signed-in user instead of redirecting home", async () => {
    // reuse the existing test's setup (valid unexpired session cookie, path '/login')
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
});
```
Keep (or add) the unverified-user-on-`/login` → `verifyEmailPath` test unchanged.

- [ ] **Step 2: Run** `rtk npx vitest run src/firebase_auth/middleware` — Expected: the renamed test FAILS (307).

- [ ] **Step 3: Implement** — change the condition:
```ts
} else if (isVerifyEmailPage && decodeTokenOnce(token!)?.email_verified === true) {
```
Update the block comment above it to drop the auth-page sentence.

- [ ] **Step 4: Run** middleware tests — Expected: PASS. Fix any other test that asserted the old auth-page→home redirect by switching it to expect 200.
- [ ] **Step 5: Commit** `fix: don't redirect auth pages home on cookie-only session`

---

### Task 3: Client clears stale server cookies on auth pages; redirects signed-in users home

**Files:**
- Modify: `src/firebase_auth/client/auth_user_provider.tsx` (the `clearSession(..., previous ?? initialSignedIn)` call ~L236)
- Test: `src/firebase_auth/client/auth_user_provider.test.tsx`

**Interfaces:** `clearSession(..., clearServerCookies = true)` already exists (added this session). Call becomes `previous ?? (initialSignedIn || isAuthPage)`.

- [ ] **Step 1: Write failing tests** (follow the file's existing mocking of `onIdTokenChanged`, `clearSessionAction`, `useRouter`, `usePathname`):

```tsx
it("calls clearSessionAction on an auth page when the SDK resolves to null", async () => {
    pathname = "/login";
    renderProvider({ initialUser: null });
    await emitIdToken(null);
    expect(clearSessionAction).toHaveBeenCalledTimes(1);
});

it("skips clearSessionAction for an anonymous visitor on a public page", async () => {
    pathname = "/";
    renderProvider({ initialUser: null });
    await emitIdToken(null);
    expect(clearSessionAction).not.toHaveBeenCalled();
});

it("redirects a signed-in SDK user off /login to homePath", async () => {
    pathname = "/login";
    renderProvider({ initialUser: null });
    await emitIdToken(fakeUser({ emailVerified: true }));
    expect(router.replace).toHaveBeenCalledWith(expect.stringContaining(config.firebaseAuth.homePath));
});
```
(Use the helper names the file already has; if it lacks `emitIdToken`, capture the `onIdTokenChanged` callback from the mock and invoke it inside `act`.)

- [ ] **Step 2: Run** `rtk npx vitest run src/firebase_auth/client` — Expected: first test FAILS.
- [ ] **Step 3: Implement** — change the argument to `previous ?? (initialSignedIn || isAuthPage)`; add `isAuthPage` to that effect's closure (it's already in component scope; the subscribe effect has `[]`-style deps — read `isAuthPage` via a ref `const isAuthPageRef = useRef(isAuthPage); isAuthPageRef.current = isAuthPage;` and use `isAuthPageRef.current`).
- [ ] **Step 4: Run** all `src/firebase_auth` tests — Expected: PASS.
- [ ] **Step 5: Commit** `fix: clear stale session cookies on auth pages when SDK is signed out`

---

### Task 4 (app, inflalite): Disable auth forms until hydrated

**Files:**
- Search first: `rtk grep -rn "useSyncExternalStore\|useHydrated\|useIsClient" src node_modules/cloudflare-next-intl/src` — reuse any existing hook.
- Create (only if none exists): `src/shared/hooks/use_hydrated.ts`
- Modify: each `src/shared/components/auth/*_client_form.tsx` `<fieldset disabled={form.isPending} ...>` and the submit button's disabled prop.

**Interfaces:** `export default function useHydrated(): boolean`.

- [ ] **Step 1: Implement hook**
```ts
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export default function useHydrated(): boolean {
    return useSyncExternalStore(subscribe, () => true, () => false);
}
```
- [ ] **Step 2: Wire** in every client form: `const hydrated = useHydrated();` and `<fieldset disabled={!hydrated || form.isPending} className="contents">`; if `AuthSubmitButton` sits outside the fieldset pass `disabled={!hydrated || form.isPending}`.
- [ ] **Step 3: Verify** after bumping `cloudflare-next-intl` in inflalite to the version containing Tasks 1–3: `rtk npm run build`, then `curl -s <preview>/login | grep -c "<input"` — Expected: ≥1 input with `disabled` in the fieldset; page HTML contains the submit button.
- [ ] **Step 4: Manual check** on preview: tap profile icon signed-out → lands on `/login` (no 307 in network tab); signed-in → `/login` goes home after SDK loads; forms show disabled fields on first paint, enabled after hydration, no layout shift.
- [ ] **Step 5: Commit** `fix: render auth forms disabled until hydrated`

---

## Release order

1. Tasks 1–3 in `cloudflare-next-intl` → publish new patch version.
2. Task 4 in inflalite with the version bump in the same commit.

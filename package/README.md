# cloudflare-next-intl

Optimized internationalization (i18n) package specialized for Next.js App Router
and Cloudflare environment.

## Features

- **Optimized for Cloudflare**: Designed to work seamlessly with Cloudflare
  Pages and Workers.
- **Server Components Support**: Full support for Next.js App Router and Server
  Components.
- **Fast and Efficient**: Low overhead and minimal bundle size.
- **Tree-shaking**: Properly architected for optimal tree-shaking.
- **Error handling**: shared, opt-in `console.error` override and
  `reportError`/`withErrorHandling` helpers, GDPR-aware (consent-gated).
- **Database**: optional Postgres/Drizzle data-access layer, reachable either
  directly (Cloudflare Hyperdrive or a connection string) or through the
  Supabase Data API (project URL + anon key only), with request-scoped
  public/user contexts and RLS wiring in both modes.

## Installation

```bash
npm install cloudflare-next-intl
```

## Setup

This package resolves your routing config through the `@intl-config` module
alias, so setup has two required steps — both must be done for the package
to work.

### 1. Create your config file

```typescript
// src/i18n/intl_config.ts
import { setIntlConfig } from "cloudflare-next-intl/setIntlConfig";

export default setIntlConfig({
    locales: ["en", "de"],
    defaultLocale: "en",
    // ... other RoutingConfig fields (localePrefix, localeCookie, localeDetection)
});
```

### 2. Point `@intl-config` at it in `next.config`

Required for both webpack and Turbopack — omitting either breaks the build
mode that uses it. Path is relative to `next.config`.

```typescript
// next.config.ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    turbopack: {
        resolveAlias: {
            "@intl-config": "./src/i18n/intl_config.ts",
        },
    },
    webpack(config) {
        config.resolve.alias = {
            ...config.resolve.alias,
            "@intl-config": path.resolve(__dirname, "src/i18n/intl_config"),
        };
        return config;
    },
};

export default nextConfig;
```

If this alias is missing, any import from `cloudflare-next-intl` throws an
error naming the missing `@intl-config` alias at startup.

### 3. Wire up the middleware

```typescript
// src/middleware.ts
import intlMiddleware from "cloudflare-next-intl/middleware";

export const middleware = intlMiddleware;

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

## Usage

### Server Components

```tsx
import { getTranslations } from "cloudflare-next-intl/server";

export default async function Page() {
    const t = await getTranslations("Index");
    return <h1>{t("title")}</h1>;
}
```

`t(key)` always returns a `string`. For a message whose value is an array
or nested object (e.g. a list), use `t.raw(key)` to get it back as-is:

```tsx
const t = await getTranslations("Index");
const items = t.raw("items") as string[]; // messages.Index.items
```

### Client Components

```tsx
"use client";

import { LocaleLink } from "cloudflare-next-intl/client";

export function Navigation() {
    return (
        <LocaleLink href="/about">
            About Us
        </LocaleLink>
    );
}
```

### Locale-aware links (non-locale-switching)

Use `Link` (server-safe, from `./Link`) for normal navigation that should
stay on the current locale — it prepends the locale segment for you:

```tsx
import Link from "cloudflare-next-intl/Link";

<Link href="/about">About</Link> // -> "/about" or "/de/about"
```

`LocaleLink` (client-only) is for explicitly switching locale, e.g. a
language switcher — see the Client Components example above.

### Reading the current locale

```tsx
// Server Components
import { getLocale } from "cloudflare-next-intl/server";
const locale = await getLocale();
```

```tsx
// Client Components ("use client")
import { useLocale } from "cloudflare-next-intl/use";
const locale = useLocale();
```

`useTranslations`/`useLocale` from `cloudflare-next-intl/use` also work
inside Server Components without `await` (backed by React's `use()`), as
long as they're rendered under `IntlProvider`.

### Root layout wiring

```tsx
import { IntlProvider, IntlHelperScript, getLocaleStaticParams } from "cloudflare-next-intl/server";

export const generateStaticParams = getLocaleStaticParams;

export default async function RootLayout({ children, params }) {
    const { locale } = await params;
    return (
        <html lang={locale}>
            <head>
                <IntlHelperScript />
            </head>
            <body>
                <IntlProvider language={locale}>{children}</IntlProvider>
            </body>
        </html>
    );
}
```

### Static export (`output: 'export'`) support

The regular `IntlProvider` (`cloudflare-next-intl/serverProvider`, re-exported
from the root) always has a code path to the firebase-auth client provider,
which imports a `"use server"` file (`clear_session_action`) for clearing
the session cookie on logout. Next.js registers a `"use server"` file into
the server-actions build the moment **any** `import()` in the compiled
module graph points to it — a runtime `if (config.firebaseAuth)` guard does
not remove the import *statement*, only skips executing it, so the file is
still registered even on apps that never configure `firebaseAuth`.
`output: 'export'` builds fail outright the instant any server action is
registered anywhere in the app, so this affects every app doing a static
export, not just ones using auth.

If your app is built with `output: 'export'` and does **not** configure
`firebaseAuth`, use `cloudflare-next-intl/serverProviderStatic` instead —
same signature (minus `staticSafe`, which only exists to control firebase
auth's server-side resolution), same locale/messages/cookie-consent
behavior, but its client provider has zero import anywhere pointing at the
firebase-auth client code, so there is nothing for Next's scanner to find:

```tsx
import { IntlProvider } from "cloudflare-next-intl/serverProviderStatic";
```

It throws at render time if `firebaseAuth` is configured — that combination
isn't supported by this variant; use the regular `serverProvider` for apps
that need Firebase Auth (which in turn means you can't statically export
those routes, per the constraint above).

If your app imports the regular `IntlProvider` from the package root and
can't change that import site (e.g. it's inside another package, or you
don't want to special-case your own source per build target), redirect it
at the bundler level instead — alias the **resolved absolute file path**
(not the package specifier) for both `server_provider.js` and
`client_provider.js` to their `_static` counterparts, only when building
for static export:

```ts
// next.config.ts
webpack(config) {
    if (process.env.STATIC_EXPORT === "true") {
        // realpath, not the raw node_modules path — webpack resolves
        // symlinks (e.g. `npm link`) to their real target before matching
        // aliases, so an alias keyed on the symlink path would never match.
        const root = fs.realpathSync(path.resolve(__dirname, "node_modules/cloudflare-next-intl"));
        config.resolve.alias[path.join(root, "dist/src/server/components/server_provider.js")] =
            path.join(root, "dist/src/server/components/server_provider_static.js");
        // client_hooks.ts (useLocale/useTranslations) imports LocaleContext
        // from client_provider.js directly — a second, independent edge to
        // the same firebase-auth chain that the alias above doesn't cover.
        config.resolve.alias[path.join(root, "dist/src/client/components/client_provider.js")] =
            path.join(root, "dist/src/client/components/client_provider_static.js");
    }
    return config;
},
```

### SEO metadata (hreflang/canonical)

```ts
import { alternatesLinks } from "cloudflare-next-intl/metadata";

export async function generateMetadata({ params }) {
    const { locale } = await params;
    return {
        alternates: alternatesLinks({ url: "https://example.com", locale, linkPart: "/about" }),
    };
}
```

### Theme switcher

### Firebase Auth

Set `firebaseAuth` on your `RoutingConfig` to enable — `IntlProvider` then
auto-wires `AuthUserProvider` and server-side `getAuthUser` session validation.

Features include:
- `whiteListPaths`: Array of paths exempt from auth redirects (matches exact path or path-segment prefix, e.g. `/bonds` matches `/bonds/some-slug`).
- `actionLinkPath`: Pinned route for handling Firebase action links (e.g. `/auth/action`), prioritized during cross-origin action link redirects.
- `createForgotPasswordAction(locale, actionCodeSettings?)`: Accepts optional Firebase `AuthActionCodeSettings` (e.g. `url` redirect link).
- `sendVerificationEmail(actionCodeSettings?)` on `useAuthUser()`: Custom action email settings when resending email verification.
- `followSameOriginContinueUrl`: Automatically forwards emailed action links with `continueUrl` to the specified path (or external URL) directly from `intlMiddleware` (default `true`; set `false` on `firebaseAuth` config to disable). If `continueUrl` points to home root (`/`), it resolves to `actionLinkPath` (if set) or the mode target path (e.g. `/reset-password`).

```tsx
import ThemeSwitcher from "cloudflare-next-intl/ThemeSwitcher";

<ThemeSwitcher lightLabelText="Light" darkLabelText="Dark" />
```


### Cookie consent

Set `cookieConsent` on your `RoutingConfig` to enable — `IntlProvider` then
auto-wires `CookieConsentProvider`, `CookieConsentAnalytics` (if
`cookieConsent.analytics`/`getAnalytics` is set), and both `CookieConsentDialog`/
`PrivacyPolicyUpdateDialog` (with their built-in default styling and
English/Ukrainian copy) with no manual nesting needed.

```typescript
// intl-config.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";

export default setIntlConfig({
    locales: ["en", "de"],
    defaultLocale: "en",
    // Shared request-time resolvers — used by cookieConsent's GDPR gating
    // below AND by error_handling's ctx.waitUntil backgrounding.
    generate: {
        // Pass @opennextjs/cloudflare's getCloudflareContext directly — its
        // exact overloaded signature is accepted as-is, called internally
        // with { async: true } (cookieConsent) or { async: false } (error_handling).
        getCloudflareContext,
    },
    cookieConsent: {
        privacyPolicyDate: "2026-01-01",
        // privacyPolicyPath: "/privacy-policy", // default; used by the
        // dialogs' auto-rendered link. Set false to disable that link.
        // Optional: gate the banner to GDPR-region visitors only. Omit both
        // getCountryCode and generate.getCloudflareContext to disable
        // country-based gating (consent always implicit).
        // gdprCountries: [...], // defaults to EU/EEA + UK + Switzerland
        // enableAnalyticsInDevMode: true, // analytics stay off in dev otherwise
        // autoWireDialogs: false, // opt out and render the dialogs yourself
        // dialogProps: { acceptText: "Accept" }, // forwarded to CookieConsentDialog
        // updateDialogProps: { closeText: "Got it" }, // forwarded to PrivacyPolicyUpdateDialog
    },
});
```

`CookieConsentDialog`/`PrivacyPolicyUpdateDialog` render automatically — no
JSX needed in your layout. Set `autoWireDialogs: false` to render them
yourself instead (e.g. for full control over placement):

```tsx
import { CookieConsentDialog, PrivacyPolicyUpdateDialog, useCookieConsent } from "cloudflare-next-intl/cookieConsent";

export default function Layout({ children }) {
    return (
        <>
            {children}
            <CookieConsentDialog />
            <PrivacyPolicyUpdateDialog />
        </>
    );
}
```

```tsx
"use client";
import { useCookieConsent } from "cloudflare-next-intl/useCookieConsent";

const { consent, setConsent } = useCookieConsent();
```

See [`package/src/cookie_consent/README.md`](package/src/cookie_consent/README.md) for layout, customization, and gotchas.

### Error handling

Every risky call this package makes internally (Cloudflare-context
resolution, Firebase server auth, `cookieConsent.getAnalytics()`) reports
through a shared `error_handling` submodule you can also use in your own
app code. Enabled by default — no config needed to get the default
`console.error`-based reporting; set `errorHandling.onError` to plug in
your own transport (Sentry, Telegram, etc).

```typescript
// intl-config.ts
export default setIntlConfig({
    locales: ["en", "de"],
    defaultLocale: "en",
    generate: { getCloudflareContext }, // reports background via ctx.waitUntil when set
    errorHandling: {
        // enable: false, // fully disable reporting (errors still rethrow from withErrorHandling)
        onError: ({ formattedMessage, error, classOrMethodName, consent }) => {
            // formattedMessage is a ready-to-print "[classOrMethodName] Error: ..." string
            myErrorTracker.capture(formattedMessage);
        },
        // overrideConsoleError: true, // route every console.error(...) call through onError too
        // ignoreConsoleErrors: [...], // defaults to defaultIgnoredConsoleErrors (this package's
        //                             // own Firebase Auth codes for expected user-input failures);
        //                             // pass [] to report everything, or your own list to replace it
        // ignoreConsoleError: (message) => message.includes("known noisy warning"),
    },
});
```

Use `reportError`/`withErrorHandling` directly in your own code:

```typescript
import { reportError, withErrorHandling } from "cloudflare-next-intl/errorHandling";
import config from "./intl-config";

// Wrap a function — reports then rethrows on failure.
const safeFetch = withErrorHandling(fetchSomething, "fetchSomething", { config });

// Or report manually inside your own try/catch.
try {
    await riskyThing();
} catch (error) {
    await reportError(config, { error, classOrMethodName: "riskyThing" });
}
```

**GDPR note:** pass `consent` (from `useCookieConsent()` or your own
server-side resolution) on `ErrorHandlingParams` — reporting is skipped
whenever `consent` is set and not `true`, since sending error reports to a
third party without consent can itself be GDPR-relevant.

### Database (`db`)

Thin Postgres/Drizzle data-access layer over a Cloudflare Hyperdrive binding
(or a plain connection string). `pg` and `drizzle-orm` ship as dependencies of
this package, so there is nothing extra to install. They are loaded through
dynamic `import()` inside the `db` exports, so an app that never calls a `db`
export never pulls them into its bundle. Enable it by setting `db` on your
`RoutingConfig`:

```typescript
// src/i18n/intl_config.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";

export default setIntlConfig({
    locales: ["en", "uk"] as const,
    defaultLocale: "en",
    generate: { getCloudflareContext },
    db: { hyperdriveBinding: "HYPERDRIVE" },
});
```

`db` fields (all optional):

- `connectionString` — a Postgres connection string. Omit to resolve it from
  the Hyperdrive binding named by `hyperdriveBinding` instead (the normal
  production setup); a value here always wins over the binding, which is
  what makes local dev / build-time evaluation work.
- `hyperdriveBinding` — name of the Hyperdrive binding on `env` to read a
  connection string from when `connectionString` is not set. Defaults to
  `'HYPERDRIVE'`. Requires `generate.getCloudflareContext` to be configured.
- `disconnectAfterRequest` — whether the pooled client is closed once the
  last in-flight `withPublicDb`/`withUserDb` call of the request
  finishes. Defaults to `true` (one connection per request, released to
  Hyperdrive immediately). Set `false` to keep the connection open for the
  lifetime of the isolate — faster for a long-lived server, but it holds a
  Hyperdrive connection slot between requests.
- `authenticatedRole` — Postgres role assumed inside `withUserDb`'s
  transaction. Defaults to `'authenticated'` (the Supabase RLS convention).
- `getUserId` — resolves the user id injected as
  `request.jwt.claims->>'sub'` inside `withUserDb`. Omit when
  `firebaseAuth` is configured — the uid then comes from this package's own
  `getAuthUser()` automatically. Provide it to use a different auth source
  (or when `firebaseAuth` is absent).
- `disconnectTimeoutMs` — milliseconds `disconnectPostgres` waits for
  `client.end()` before giving up. Defaults to `2000`.

#### Choosing a transport

`db` reaches Postgres one of two ways, decided by which fields you set. The
query code is identical either way — switching is a config change only.

| Config | Transport | Use when |
|---|---|---|
| `connectionString` or `hyperdriveBinding` | Direct Postgres via `pg` | You have a Postgres password or a Hyperdrive binding. |
| `supabase` | Supabase Data API (PostgREST) | You only have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |

A direct connection always wins if both are configured, so adding a `supabase`
block cannot silently reroute live traffic.

```typescript
export default setIntlConfig({
    locales: ["en", "uk"] as const,
    defaultLocale: "en",
    // reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
    db: { supabase: {} },
});
```

```typescript
// unchanged in both modes
const rows = await withPublicDb((db) => db.select().from(bonds).limit(10));
```

Supabase mode requires one function in your database, shipped at
`node_modules/cloudflare-next-intl/supabase/cfni_exec.sql`. Run it once (via
`supabase db push`, a migration, or the SQL editor). It is `security invoker`,
so statements execute with the caller's own privileges and RLS applies exactly
as it does over the REST API. `@supabase/supabase-js` ships as a dependency of
this package and is loaded through dynamic `import()` inside the `db` exports,
same as `pg`/`drizzle-orm` — an app that never calls a `db` export never
bundles any of them.

`db.supabase` fields (all optional):

- `url` — project URL. Defaults to `NEXT_PUBLIC_SUPABASE_URL`.
- `anonKey` — anon/publishable key. Defaults to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Never put a service-role key here.
- `execFunction` — name of the exec function. Defaults to `'cfni_exec'`.

`db.getAccessToken` resolves the JWT `withUserDb` sends as
`Authorization: Bearer`, which is what makes PostgREST resolve the caller as
`authenticated`. Omit it when `firebaseAuth` is configured — the signed-in
user's Firebase ID token is used automatically.

**Two differences to know about in Supabase mode:**

- **Per-statement transactions.** Each statement in a `withUserDb` callback is
  its own round-trip, so it is its own implicit transaction. Multi-statement
  atomicity is available in connection-string mode only.
- **Wider SQL surface.** `cfni_exec` runs statements your app generates, so any
  role that can execute it can run arbitrary SQL *within that role's own
  privileges* — a broader surface than PostgREST's normal verbs, though still
  bounded by RLS and your grants. If your app only uses `withUserDb`, drop the
  anon grant: `revoke execute on function public.cfni_exec(text, jsonb) from anon;`

Two query wrappers, both from `cloudflare-next-intl/db`. Choose by who is
allowed to see the rows:

- `withPublicDb(fn)` — runs `fn` as the anonymous role: a pooled connection
  with no transaction/role switch in connection-string mode, or the anon key
  as the PostgREST bearer token in Supabase mode. No user id is attached
  either way, so RLS policies that test `auth.jwt()->>'sub'` will deny access
  — use `withUserDb` for user-owned rows.
- `withUserDb(fn, uid?)` — runs `fn` as the signed-in user. In
  connection-string mode this opens a transaction where Postgres sees the
  resolved user id as `auth.jwt()->>'sub'` under `db.authenticatedRole`; in
  Supabase mode identity instead rides on the JWT from `getAccessToken`/
  Firebase, sent as `Authorization: Bearer` (see the atomicity caveat above).
  Either way RLS behaves as it does for a PostgREST-issued call. `uid`
  overrides the user id in connection-string mode only; when omitted there,
  the id comes from `db.getUserId()` if set, otherwise automatically from the
  signed-in Firebase user when `firebaseAuth` is configured — you rarely need
  to pass it explicitly.

```typescript
// anywhere on the server
import { withPublicDb } from "cloudflare-next-intl/db";

const rows = await withPublicDb((db) => db.select().from(bonds).limit(10));
```

`cloudflare-next-intl/dbHelpers` also exports a set of generic Drizzle SQL
helpers (`excluded`, `onConflictSet`, `ago`, `currentDate`, `windowCount`,
`unnestLateral`, `ascNullsLast`, `alwaysTrue`, `lateral`, `aliasColumn`,
`minOf`, `maxOf`, `roundReal`, `multiply`, `scalarFromCte`) for building
upsert/window/lateral-join queries without dropping to raw SQL, plus a
re-export of `drizzle-orm`'s common query-building primitives (`eq`, `and`,
`or`, `asc`, `desc`, `gte`, `gt`, `lte`, `lt`, `isNull`, `isNotNull`, `count`,
`sum`, `max`, `min`, `sql`) — so code that only builds queries against the
`DrizzleDb` handle from `withPublicDb`/`withUserDb` doesn't need its own
`drizzle-orm` import for these. Anything not listed here (schema definitions,
`drizzle-orm/pg-core` column builders, relations) still comes from
`drizzle-orm` directly — this package re-exports the query-operator surface
only, not the whole library.

#### Testing code that calls `withPublicDb`/`withUserDb`

`cloudflare-next-intl/dbTesting` exports a fake `DrizzleDb` so repository/unit
tests don't need a real Postgres connection:

```typescript
import { makeFakeDb, rowsResult } from "cloudflare-next-intl/dbTesting";

const db = makeFakeDb([rowsResult([{ id: 1 }])]);
const rows = await db.select().from(bonds).limit(10);
// rows === [{ id: 1 }]
```

`makeFakeDb(results)` takes an ordered queue of `rowsResult(rows)` (for
`select`/`insert`/`update`/`delete`) and `executeResult(rows)` (for
`execute(...)`) entries, consumed one per terminal call in the exact order
your code issues them. Every intermediate chain call (`.where(...)`,
`.values(...)`, `.orderBy(...)`, etc.) is recorded with its exact arguments,
inspectable via `db.calls[i].chain.argsOf('where')` — so a test can assert not
just "select was called" but "the second select's `.where(...)` argument was
X". Handles `db.$with(name).as(builder)` / `db.with(...).select(...)`
CTE-style queries the same way the real Drizzle client does.

## License

MIT

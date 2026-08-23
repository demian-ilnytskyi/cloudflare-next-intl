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
  directly (a connection string, e.g. from Cloudflare Hyperdrive) or through the
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

### 2b. Deploying to Cloudflare Workers: alias it in `wrangler.toml` too

`wrangler deploy`/`wrangler dev` bundle the Worker with their own esbuild
pass, separate from Next's webpack/Turbopack build — the `next.config`
alias above doesn't apply to it. Without this, `wrangler deploy` fails with
`Could not resolve "@intl-config"`. Path is relative to `wrangler.toml`.

```toml
# wrangler.toml
[alias]
"@intl-config" = "./src/i18n/intl_config.ts"
```

Put `[alias]` after all top-level scalar keys (`name`, `main`,
`compatibility_date`, `compatibility_flags`, etc.) and before any other
`[table]`/`[[array_of_tables]]` header — TOML assigns every key that follows
a table header to that table until the next header, so an `[alias]` placed
earlier silently swallows the keys meant for the top level.

**In a monorepo, give every Worker its own alias target — never point two
Workers' `[alias]` at the same shared config file.** Declaring `[alias]`
makes Wrangler eagerly resolve and bundle whatever it points to, even if
nothing in that Worker's own code imports `@intl-config`. If a second,
smaller Worker (e.g. a cron/background worker) points its alias at the main
app's config file, it inherits that file's whole import graph — every
package the main app's config touches (Firebase, a DB client, `zod`, etc.)
must then be a dependency of the small Worker too, or the build fails with
`Could not resolve "<package>"` for packages that Worker never actually
uses. Give it its own minimal file instead:

```typescript
// backend/src/i18n/intl_config.ts — deliberately minimal, not the main
// app's config: aliasing it there would drag in every dependency that
// config touches, even ones this Worker never imports.
import { setIntlConfig } from "cloudflare-next-intl";

export default setIntlConfig({
    locales: ["en"],
    defaultLocale: "en",
});
```

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

Thin Postgres/Drizzle data-access layer over a Postgres connection string
(which may come from a Cloudflare Hyperdrive binding). `pg` and `drizzle-orm` ship as dependencies of
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
    db: {
        connectionString: async () =>
            (await getCloudflareContext({ async: true })).env.HYPERDRIVE
                .connectionString,
    },
});
```

`db` fields (all optional):

- `connectionString` — a Postgres connection string, or a sync/async function
  returning one (resolved on each connect). The function form is how you reach
  a value that isn't available at module scope — a Cloudflare Hyperdrive
  binding, or a secret store — as in the example above.
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
| `connectionString` | Direct Postgres via `pg` | You have a Postgres connection string, or a Hyperdrive binding to read one from. |
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
`supabase db push`, a migration, or the SQL editor) — the file starts with a
`drop function if exists` so re-running it to upgrade is always safe. It is
`security invoker`, so statements execute with the caller's own privileges and
RLS applies exactly as it does over the REST API; **never** change this to
`security definer` — that would let any caller (anon included) bypass RLS
through the function, regardless of the role PostgREST resolved them as.
`@supabase/supabase-js` ships as a dependency of this package and is loaded
through dynamic `import()` inside the `db` exports, same as `pg`/`drizzle-orm`
— an app that never calls a `db` export never bundles any of them.

`db.supabase` fields (all optional):

- `url` — project URL, or a sync/async function returning one. Defaults to
  `NEXT_PUBLIC_SUPABASE_URL`.
- `anonKey` — anon/publishable key, or a sync/async function returning one.
  Defaults to `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put a service-role key
  here.
- `execFunction` — name of the exec function. Defaults to `'cfni_exec'`.
- `rawSql` — whether `withPublicDb`/`withUserDb` may run arbitrary SQL
  through `cfni_exec`. Defaults to `true`. Set `false` if you don't want to
  (or can't) install `cfni_exec` — see
  [Supabase mode without `cfni_exec`](#supabase-mode-without-cfni_exec) below.

Any of `connectionString`, `supabase.url`, and `supabase.anonKey` may be a
function instead of a string, resolved (and awaited) at use time rather than
when the config object is built — useful when the value lives in a secret
store or a Cloudflare binding rather than an environment variable:

```typescript
export default setIntlConfig({
    locales: ["en", "uk"] as const,
    defaultLocale: "en",
    generate: { getCloudflareContext },
    db: {
        supabase: {
            url: "https://abc.supabase.co",
            anonKey: async () => {
                const { env } = await getCloudflareContext({ async: true });
                return env.SUPABASE_ANON_KEY.get();
            },
        },
    },
});
```

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
  anon grant: `revoke execute on function public.cfni_exec(text) from anon;`

**What `cfni_exec` actually supports:** plain `SELECT` (including joins with
duplicate column names, CTEs, window functions), `INSERT`/`UPDATE`/`DELETE`
with or without `RETURNING` (including `ON CONFLICT ... DO UPDATE` via
`excluded`/`onConflictSet` from `cloudflare-next-intl/dbHelpers`), and
writable CTEs (`with x as (update ... returning ...) select ... from x`).
Every value round-trips through Postgres' own text representation, not JSON,
so arrays/`numeric`/timestamps/`bytea` decode the same way they do in
connection-string mode. Not supported: multi-statement transactions (each
call is its own PostgREST round-trip — see above).

#### Supabase mode and REST translation

You write the exact same Drizzle code with `withPublicDb`/`withUserDb` in Supabase mode as in connection-string mode. Behind the scenes, the transport translates each statement into `@supabase/supabase-js` `.from()` PostgREST calls whenever possible:

```typescript
import { withPublicDb, withUserDb } from "cloudflare-next-intl/db";
import { eq, gte, desc } from "cloudflare-next-intl/dbHelpers";

// Automatically translated to PostgREST REST calls:
const rows = await withPublicDb((db) =>
    db.select({ id: bonds.id, name: bonds.name, yield: bonds.yield })
        .from(bonds)
        .where(gte(bonds.yield, 5))
        .orderBy(desc(bonds.yield))
        .limit(10)
);

await withPublicDb((db) => db.insert(bonds).values({ name: "10Y", yield: 4.2 }));
await withPublicDb((db) =>
    db.insert(bonds)
        .values({ id: 1, name: "10Y", yield: 4.5 })
        .onConflictDoUpdate({ target: bonds.id, set: { yield: 4.5 } })
);
await withPublicDb((db) => db.update(bonds).set({ yield: 4.3 }).where(eq(bonds.id, 1)));
await withPublicDb((db) => db.delete(bonds).where(eq(bonds.id, 1)));
```

**Transport routing:**
1. **REST translation first:** Single-table `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `on conflict`, and `returning` are mapped to `@supabase/supabase-js` `.from()` calls.
2. **`cfni_exec` fallback:** Statements PostgREST cannot express (joins, CTEs, complex subqueries) fall back to the `cfni_exec` SQL-exec function.
3. **`rawSql: false` mode:** If `db.supabase.rawSql: false` is configured (when `cfni_exec` is not installed), any statement requiring raw SQL throws an error explaining the limitation and how to resolve it.

| Operation | REST API | `cfni_exec` fallback |
| --- | --- | --- |
| Single-table `SELECT` (projections, `count(*)`, `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET`) | Supported | Used if untranslatable |
| Single-table `INSERT` / `UPDATE` / `DELETE` | Supported | Used if untranslatable |
| `ON CONFLICT DO NOTHING / UPDATE` | Supported | Supported |
| `RETURNING` clauses | Supported | Supported |
| Operators: `=`, `<>`, `!=`, `>`, `>=`, `<`, `<=`, `like`, `ilike`, `is [not] null`, `[not] in`, `is [not] distinct from`, `~`, `~*`, `@>`, `<@`, `&&`, `>>`, `<<`, `&>`, `&<`, `-|-`, `@@` | Supported | Supported |
| Multi-table joins, CTEs, non-count aggregates, `GROUP BY`, `UNION`, `DISTINCT`, raw SQL | Not supported by REST | Supported |
| Multi-statement transactions | Not supported | Not supported (Postgres connection only) |

#### Enforcing single API via ESLint (`cloudflare-next-intl/dbEslint`)

To prevent application code from bypassing the single `db` API with direct driver imports (`@supabase/supabase-js`, `pg`, `postgres`, or deep `dist/` paths), spread the shipped flat-config fragment in your `eslint.config.js`:

```typescript
import dbEslint from "cloudflare-next-intl/dbEslint";

export default [
    ...dbEslint,
    // your other configs...
];
```

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
`sum`, `max`, `min`, `sql`, `inArray`, `notInArray`, `ne`, `like`, `ilike`,
`between`, `not`, `exists`) — so code that only builds queries against the
`DrizzleDb` handle from `withPublicDb`/`withUserDb` doesn't need its own
`drizzle-orm` import for these.

For schema definitions, `cloudflare-next-intl/dbSchema` re-exports the
`drizzle-orm/pg-core` table and column builders (`pgTable`, `varchar`,
`integer`, `index`, `pgEnum`, …) alongside the `sql` tag, so generated schema
files can import from this package too:

```ts
import { pgTable, varchar, integer } from 'cloudflare-next-intl/dbSchema';
```

Relations and any other advanced Drizzle surface still come from `drizzle-orm`
directly.

#### Schema codegen (`cfni-db-codegen`)

The package ships a `cfni-db-codegen` binary that regenerates Drizzle models by
introspecting a live Postgres with `drizzle-kit pull`, patches drizzle-kit's
bare function-call defaults into raw-SQL-wrapped ones, and writes a
`manifest.json` next to the schema so `--check` can fail CI when the DDL
changed without regenerating.

```bash
npx cfni-db-codegen
npx cfni-db-codegen --check
```

| Flag | Env | Default |
| --- | --- | --- |
| `--ddl-dir=` | `CFNI_DB_DDL_DIR` | `supabase/data-base` |
| `--out-dir=` | `CFNI_DB_OUT_DIR` | `src/shared/db/generated` |
| `--out-file=` | `CFNI_DB_OUT_FILE` | `schema.ts` |
| `--db-url=` | `CODEGEN_DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `--drizzle-config=` | `CFNI_DB_DRIZZLE_CONFIG` | none |
| `--rpc-dir=` | `CFNI_DB_RPC_DIR` | sibling of `--ddl-dir`, e.g. `supabase/rpc` |
| `--tests-dir=` | `CFNI_DB_TESTS_DIR` | sibling of `--ddl-dir`, e.g. `supabase/tests` |
| `--force` | `CFNI_DB_FORCE_EXEC=true` | off |
| `--skip-exec` | `CFNI_DB_SKIP_EXEC=true` | off |
| `--check` | — | off |

`--out-dir` may be repeated, or given a comma-separated list, to generate the
same schema into several projects in one run (`CFNI_DB_OUT_DIR` accepts a
comma-separated list too). The database is introspected once and the identical
schema plus manifest is written to every target; `--check` verifies all of
them and fails naming the first one that is stale.

```bash
npx cfni-db-codegen --out-dir=src/shared/db/generated --out-dir=../other-app/src/db/generated
```

##### Keeping `cfni_exec.sql` in sync (`--rpc-dir`/`--tests-dir`/`--force`/`--skip-exec`)

After a successful (non-`--check`) run, `cfni-db-codegen` also copies
`supabase/cfni_exec.sql` and its pgTAP test file (see
[Testing `cfni_exec.sql` itself](#testing-cfni_execsql-itself) below) into
your project — `--rpc-dir`/`--tests-dir` (defaulting to sibling folders of
`--ddl-dir`, so `rpc`/`tests` next to `data-base`). This keeps a project that
enables Supabase mode's raw-SQL path always holding the current version of the
function, without a manual copy-paste step.

This step is gated on `db.supabase.rawSql` (see
[Supabase mode without `cfni_exec`](#supabase-mode-without-cfni_exec)):
codegen reads your `next.config.*`'s `@intl-config` alias, opens the intl
config file it points at, and looks for a literal `rawSql: true`/`rawSql:
false`. If it's explicitly `false`, the copy is skipped entirely — no
`supabase/rpc`/`supabase/tests` folders are created. If it can't be
determined (no `next.config.*` found, no alias, or `rawSql` isn't a plain
`true`/`false` literal in the source), a warning is printed and codegen
assumes `true`, matching `withPublicDb`/`withUserDb`'s own default.

An existing target file that already matches is left untouched; one that
exists with **different** content (a customization, or a stale version) is
skipped with a warning rather than silently overwritten — pass `--force` (or
set `CFNI_DB_FORCE_EXEC=true`) to overwrite it anyway. Pass `--skip-exec` (or
set `CFNI_DB_SKIP_EXEC=true`) to turn this whole step off, independent of
`rawSql`.

To run only this step — no `drizzle-kit pull`, no live Postgres needed — use
the standalone `cfni-db-install-exec` binary instead, which accepts the same
`--rpc-dir`/`--tests-dir`/`--force` flags:

```bash
npx cfni-db-install-exec
npx cfni-db-install-exec --force
```

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

#### Testing `cfni_exec.sql` itself

Because `cfni_exec.sql` runs real SQL — statement classification (SELECT vs.
DML, writable CTEs), literal-encoding of parameters, and RLS behavior — it's
tested two ways in this package's own repo, and both are shipped so you can
reuse them against your own database rather than trusting the function
untested:

- `supabase/tests/cfni_exec.sql` — a [pgTAP](https://pgtap.org/) suite,
  runnable with `supabase test db` (or `pg_prove`) once both this file and
  `cfni_exec.sql` are installed in a database. It checks the SQL function
  directly: every statement shape `cfni_exec` classifies (plain `SELECT`,
  `INSERT`/`UPDATE`/`DELETE` with and without `RETURNING`, writable CTEs,
  `ON CONFLICT DO UPDATE`), value fidelity (arrays/booleans/`numeric`/`NULL`
  round-tripping through pg's own text form, not JSON), and that
  `SECURITY INVOKER` really does make RLS apply per-role (`anon` vs.
  `authenticated` see different rows under the same policy). `cfni-db-codegen`
  and `cfni-db-install-exec` copy this file into your project the same way
  they copy `cfni_exec.sql` itself, so it's there to run against your own
  schema whenever you want the same confidence.
- `src/db/cfni_exec.integration.test.ts` (in this package's source, not
  something copied into your project) — a Vitest suite that drives the exact
  same scenarios through the real TypeScript transport path:
  `inlineParams` → `cfni_exec` → `parseComposite`, over an actual Postgres
  connection. It's skipped automatically unless `CFNI_TEST_DATABASE_URL` is
  set (e.g. to a throwaway `docker run -d -e POSTGRES_PASSWORD=postgres -p
  55432:5432 postgres:15`), so it never runs — and never needs a database —
  during a normal `npm test`.

## AI Agent Setup & Conventions

When using AI coding assistants (Claude Code, Cursor, Copilot, Antigravity) with `cloudflare-next-intl`:

- **One Database API**: Always use `withPublicDb` or `withUserDb` from `cloudflare-next-intl/db`. Never import `@supabase/supabase-js`, `pg`, or `postgres` in application code.
- **Drizzle Schema & Helpers**: Always import schema definitions from `cloudflare-next-intl/dbSchema` (`pgTable`, `text`, `timestamp`, `uuid`, etc.) and query operators from `cloudflare-next-intl/dbHelpers` (`eq`, `and`, `or`, `inArray`, `count`, etc.).
- **Lint Enforcement**: Spread `...dbEslint` from `cloudflare-next-intl/dbEslint` in `eslint.config.js` to catch accidental driver imports.
- **Reference Document**: Direct AI tools to `llms.txt` in this package for concise rules and subpath exports.

## License

MIT


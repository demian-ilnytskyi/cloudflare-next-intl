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

## License

MIT

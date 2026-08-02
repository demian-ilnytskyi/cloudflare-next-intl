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
`cookieConsent.secrets`/`getSecrets` is set), and both `CookieConsentDialog`/
`PrivacyPolicyUpdateDialog` (with their built-in default styling and
English/Ukrainian copy) with no manual nesting needed.

```typescript
// intl-config.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";

export default setIntlConfig({
    locales: ["en", "de"],
    defaultLocale: "en",
    cookieConsent: {
        privacyPolicyDate: "2026-01-01",
        // privacyPolicyPath: "/privacy-policy", // default; used by the
        // dialogs' auto-rendered link. Set false to disable that link.
        // Optional: gate the banner to GDPR-region visitors only. Omit both
        // getters to disable country-based gating (consent always implicit).
        // Pass @opennextjs/cloudflare's getCloudflareContext directly — its
        // exact overloaded signature is accepted as-is, called internally
        // with { async: true }.
        getCloudflareContext,
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

## License

MIT

# cloudflare-next-intl-intl

[![npm](https://img.shields.io/npm/v/cloudflare-next-intl-intl.svg)](https://www.npmjs.com/package/cloudflare-next-intl-intl)
[![license](https://img.shields.io/npm/l/cloudflare-next-intl-intl.svg)](./LICENSE)

Lightweight internationalization (i18n) for the **Next.js App Router**, built for
**Cloudflare Workers / Pages** (OpenNext and Vinext).

This is the core i18n engine of [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl),
published on its own with **zero runtime dependencies** and no auth, cookie-consent,
image or database code. Use it when you only need routing + translations; use
`cloudflare-next-intl` when you also want those extras auto-wired.

## Features

- Locale routing middleware (prefix redirects/rewrites, cookie + `Accept-Language` detection).
- Translations in Server Components (`getTranslations`) and Client Components (`useTranslations`).
- Ships only the message namespaces your client components need (`clientMessages`).
- Locale-aware `Link` / `LocaleLink`, `usePathname`, `getLocale`, `useLocale`.
- Cloudflare geo helpers: `getCountry`, `getTimezone`.
- SEO helpers: `hreflang` / canonical alternates via `alternatesLinks`.
- Error handling helpers: `reportError`, `withErrorHandling`, console/global error overrides, stale-deploy recovery.
- One subpath export per feature, so unused code is tree-shaken away.

## Installation

```bash
npm install cloudflare-next-intl-intl
```

Peer dependencies: `next` (>= 12) and `react` (>= 16.8).

## Setup

The package finds your config through the `@intl-config` module alias and your
message files through `@locale-file`.

### 1. Create the config file

```ts
// src/i18n/intl_config.ts
import { setIntlConfig } from "cloudflare-next-intl-intl/setIntlConfig";

export default setIntlConfig({
    locales: ["en", "de"],
    defaultLocale: "en",
});
```

### 2. Add message files

One JSON file per locale, named `<locale>.json`:

```
src/i18n/messages/en.json
src/i18n/messages/de.json
```

```json
{
    "Index": {
        "title": "Hello world",
        "items": ["One", "Two"]
    }
}
```

### 3. Add the aliases in `next.config`

Set them for both Turbopack and webpack. If one is missing, the build that uses
that bundler fails.

```ts
// next.config.ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    turbopack: {
        resolveAlias: {
            "@intl-config": "./src/i18n/intl_config.ts",
            "@locale-file": "./src/i18n/messages",
        },
    },
    webpack(config) {
        config.resolve.alias = {
            ...config.resolve.alias,
            "@intl-config": path.resolve(__dirname, "src/i18n/intl_config"),
            "@locale-file": path.resolve(__dirname, "src/i18n/messages"),
        };
        return config;
    },
};

export default nextConfig;
```

If you deploy to Cloudflare Workers with Wrangler, add the same aliases to `wrangler.toml`:

```toml
[alias]
"@intl-config" = "./src/i18n/intl_config.ts"
"@locale-file" = "./src/i18n/messages"
```

### 4. Add the middleware

```ts
// src/middleware.ts
import intlMiddleware from "cloudflare-next-intl-intl/middleware";

export const middleware = intlMiddleware;

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

To run your own logic (auth, feature flags, A/B tests) on each request, pass a `middlewareHandler`:

```ts
export function middleware(request: NextRequest) {
    return intlMiddleware(request, {
        middlewareHandler: (locale, rewriteUrl, redirectUrl) => {
            return null; // return a NextResponse to override, or null to keep the default
        },
    });
}
```

If you need the final response, for example to update session cookies, build
your own middleware with `createIntlMiddleware({ afterResponse })`.

### 5. Set up the root layout

```tsx
// src/app/[locale]/layout.tsx
import { IntlProvider, IntlHelperScript, getLocaleStaticParams } from "cloudflare-next-intl-intl/server";

export const generateStaticParams = getLocaleStaticParams;

export default async function RootLayout({ children, params }) {
    const { locale } = await params;
    return (
        <html lang={locale}>
            <head>
                <IntlHelperScript locale={locale} />
            </head>
            <body>
                <IntlProvider language={locale}>{children}</IntlProvider>
            </body>
        </html>
    );
}
```

If you build with `output: "export"`, import `IntlProvider` from
`cloudflare-next-intl-intl/serverProviderStatic` instead.

## Usage

### Server Components

```tsx
import { getTranslations, getLocale } from "cloudflare-next-intl-intl/server";

export default async function Page() {
    const t = await getTranslations("Index");
    const locale = await getLocale();
    const items = t.raw("items") as string[];

    return <h1>{t("title")} ({locale})</h1>;
}
```

`t(key)` always returns a string. For arrays or nested objects, use `t.raw(key)`.

### Client Components

```tsx
"use client";

import { useTranslations, useLocale } from "cloudflare-next-intl-intl/use";

export function Title() {
    const t = useTranslations("Index");
    const locale = useLocale();
    return <h1>{t("title")} ({locale})</h1>;
}
```

`cloudflare-next-intl-intl/use` works in both Server and Client Components and
picks the right implementation automatically.

By default (`clientMessages: "auto"`), only the namespaces your client
components use are sent to the browser. You can set this in `setIntlConfig`:

- `clientMessages: false`: send no messages to the browser.
- `clientMessages: true`: send all messages.
- `clientMessages: ["Common", "Auth*"]`: send only the listed namespaces (prefix wildcards allowed).

### Links

```tsx
import Link from "cloudflare-next-intl-intl/Link";
import LocaleLink from "cloudflare-next-intl-intl/LocaleLink";

<Link href="/about">About</Link>              // stays on the current locale: "/about" or "/de/about"
<LocaleLink href="/" locale="de">Deutsch</LocaleLink> // client-only, switches the locale
```

`usePathname` (`cloudflare-next-intl-intl/usePathname`) returns the current path
without the locale prefix.

### Geo & timezone (Cloudflare)

```tsx
import { getCountry, getTimezone } from "cloudflare-next-intl-intl/geo";

const country = await getCountry();               // "US", "DE", "UA", ...
const timezone = await getTimezone(undefined, "UTC");
```

These work in Server Components, Server Actions, Route Handlers, and middleware
(pass `request` there). The middleware forwards the Cloudflare
`x-cf-country` / `x-cf-timezone` headers, so these values are also available
further down the request. You can change the header names with
`generate.countryHeaderNames` / `generate.timezoneHeaderNames`.

### SEO metadata

```ts
import { alternatesLinks } from "cloudflare-next-intl-intl/metadata";

export async function generateMetadata({ params }) {
    const { locale } = await params;
    return {
        alternates: alternatesLinks({ url: "https://example.com", locale, linkPart: "/about" }),
    };
}
```

### Cookies

```ts
import setCookie from "cloudflare-next-intl-intl/setCookie";
import getCookie from "cloudflare-next-intl-intl/getCookie";
```

### Error handling

```ts
import { reportError, withErrorHandling, installConsoleErrorOverride } from "cloudflare-next-intl-intl/errorHandling";
```

To send errors to your own sink (database, logging service, ...), configure
`errorHandling` in `setIntlConfig`. Each helper is also available on its own
subpath, for example `./reportClientError`, `./useStaleDeployRecovery`,
`./clearClientCache`.

## Public subpath exports

| Subpath | Contents |
| --- | --- |
| `.` | Everything below (prefer the specific subpaths for tree-shaking) |
| `./setIntlConfig` | `setIntlConfig` |
| `./middleware` | default `intlMiddleware`, `createIntlMiddleware` |
| `./server` | `getTranslations`, `getLocale`, `getMessage`, `IntlProvider`, `Link`, `IntlHelperScript`, `getLocaleStaticParams`, `getCountry`, `getTimezone` |
| `./client` | `LocaleLink`, `usePathname`, `setCookieClient`, `getCookieClient` |
| `./use` | `useTranslations`, `useLocale` (works in Server and Client Components) |
| `./serverProvider`, `./serverProviderStatic` | `IntlProvider` variants |
| `./Link`, `./LocaleLink`, `./usePathname`, `./IntlHelperScript` | Single components / hooks |
| `./geo`, `./getCountry`, `./getTimezone` | Geo helpers |
| `./metadata` | `alternatesLinks`, `languages` |
| `./localeStaticParams` | `getLocaleStaticParams` |
| `./setCookie`, `./getCookie`, `./setCookieClient`, `./getCookieClient` | Cookie helpers |
| `./errorHandling` and its per-helper subpaths | Error handling |
| `./types` | TypeScript types (`RoutingConfig`, ...) |

`./internal/*` subpaths are only for wrapper packages such as
`cloudflare-next-intl` and `cloudflare-next-intl-auth`. Don't import them in
your app; they can change in any release.

## Related packages

- [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl): all-in-one package (i18n + auth + cookie consent + images + DB), auto-wired.
- [`cloudflare-next-intl-auth`](https://www.npmjs.com/package/cloudflare-next-intl-auth): Firebase Auth & App Check built on this package.

## License

MIT

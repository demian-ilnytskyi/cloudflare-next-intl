# cloudflare-next-intl-intl

Core internationalization (i18n) and localization package specialized for Next.js App Router and Cloudflare environment.
Extracted from `cloudflare-next-intl` with zero dependencies on auth, cookie consent, or database modules.

## Features

- **Optimized for Cloudflare**: Designed to work seamlessly with Cloudflare Pages and Workers.
- **Server Components Support**: Full support for Next.js App Router and Server Components (`use()` hook + server translations).
- **Fast and Efficient**: Low overhead and minimal bundle size with zero external runtime dependencies.
- **Tree-shaking**: Properly architected for optimal tree-shaking with individual subpath exports.
- **Error handling**: Shared error-handling helpers (`reportError`, `withErrorHandling`, `installConsoleErrorOverride`).

## Installation

```bash
npm install cloudflare-next-intl-intl
```

## Setup

This package resolves your routing config through the `@intl-config` module
alias, and messages through `@locale-file`.

### 1. Create your config file

```typescript
// src/i18n/intl_config.ts
import { setIntlConfig } from "cloudflare-next-intl-intl/setIntlConfig";

export default setIntlConfig({
    locales: ["en", "de"],
    defaultLocale: "en",
});
```

### 2. Point `@intl-config` and `@locale-file` at them in `next.config`

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

### 2b. Deploying to Cloudflare Workers: alias it in `wrangler.toml` too

```toml
# wrangler.toml
[alias]
"@intl-config" = "./src/i18n/intl_config.ts"
"@locale-file" = "./src/i18n/messages"
```

## Internal Subpaths

Subpaths under `cloudflare-next-intl-intl/internal/*` are designed for consumption by wrapper packages (like `cloudflare-next-intl`). End-user applications should use public exports such as `cloudflare-next-intl-intl`, `cloudflare-next-intl-intl/client`, `cloudflare-next-intl-intl/server`, `cloudflare-next-intl-intl/middleware`, and `cloudflare-next-intl-intl/types`.

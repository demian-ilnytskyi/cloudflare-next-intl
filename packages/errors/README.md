# cloudflare-next-intl-errors

[![npm](https://img.shields.io/npm/v/cloudflare-next-intl-errors.svg)](https://www.npmjs.com/package/cloudflare-next-intl-errors)
[![license](https://img.shields.io/npm/l/cloudflare-next-intl-errors.svg)](./LICENSE)

Production-grade error reporting and stale deploy recovery for the **Next.js App Router** on **Cloudflare Workers / Pages**.

Extracted from [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl).
If you use `cloudflare-next-intl`, this package is already included and auto-wired. Use this standalone package if you only need error capturing, server error reporting, and automatic stale deploy recovery.

## Features

- **Stale deploy recovery**: automatically detects missing JavaScript chunks and stale build hashes after a new production deploy, clears browser caches, and safely reloads without infinite reload loops.
- **Server error handling**: wrap Server Actions and route handlers with `withErrorHandling()` to capture unhandled exceptions, attach request context, and safely rethrow.
- **Client global listeners**: `installGlobalErrorOverride()` and `installConsoleErrorOverride()` capture uncaught client exceptions and unhandled promise rejections.
- **Customizable reporting**: report errors to your custom backend, logging service, or database with `createServerErrorAction()` and `reportClientError()`.
- **Edge & Cloudflare context aware**: safely defers non-blocking background error reports via `ctx.waitUntil()` on Cloudflare Workers.
- **Zero dependencies**: tiny footprint with zero third-party production dependencies.

## Installation

```bash
npm install cloudflare-next-intl-errors
```

## Quick Start

### 1. Stale Deploy Recovery

When a new version of your Next.js application deploys to Cloudflare, visitors with open tabs may attempt to navigate or load old code chunks that no longer exist, causing `ChunkLoadError` or `Failed to fetch dynamically imported module`.

Add `useStaleDeployRecovery` to your client layout or root error boundary:

```tsx
"use client";

import { useStaleDeployRecovery } from "cloudflare-next-intl-errors/useStaleDeployRecovery";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const isStale = useStaleDeployRecovery(error);

    if (isStale) {
        return <p>A new version is available. Updating application...</p>;
    }

    return (
        <div>
            <h2>Something went wrong</h2>
            <button onClick={() => reset()}>Try again</button>
        </div>
    );
}
```

Or inject inline pre-hydration script tags with `<StaleDeployScripts />` in your root layout `<head>`.

### 2. Wrap Server Actions

Safely handle server errors, log them, and report them:

```ts
"use server";

import { withErrorHandling } from "cloudflare-next-intl-errors/errorHandling";

export const updateProfile = withErrorHandling(
    async (formData: FormData) => {
        // Your server action code
    },
    {
        name: "updateProfile",
        rethrow: true,
    }
);
```

### 3. Capture Client Errors Globally

Install global error overrides in a client component loaded once in your root layout:

```tsx
"use client";

import { useEffect } from "react";
import { installGlobalErrorOverride } from "cloudflare-next-intl-errors/installGlobalErrorOverride";
import { installConsoleErrorOverride } from "cloudflare-next-intl-errors/installConsoleErrorOverride";

export function ErrorMonitoringProvider() {
    useEffect(() => {
        installGlobalErrorOverride();
        installConsoleErrorOverride();
    }, []);

    return null;
}
```

## API Reference

### Stale Deploy
- `useStaleDeployRecovery(error)`: React hook that inspects an error, clears caches if stale, and triggers a controlled reload.
- `isStaleDeployError(error)`: Returns `true` if an error matches known chunk load or deployment mismatch signatures.
- `clearClientCache()`: Programmatically clears cache storages and service worker registrations.
- `StaleDeployScripts`: React component rendering inline scripts that intercept resource load failures early.

### Error Handling & Reporting
- `withErrorHandling(fn, options)`: Higher-order wrapper for server actions and async functions.
- `createServerErrorAction(config)`: Factory to create a server action that accepts and persists client error reports.
- `reportClientError(error, context)`: Sends a client error to the registered server action.
- `stringifyUnknown(err)`: Robust error stringifier handling non-Error throws, circular structures, and DOM errors.
- `formatErrorMessage(err)`: Extracts clean human-readable error messages and stacks.

## License

MIT

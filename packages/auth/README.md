# cloudflare-next-intl-auth

Firebase Auth & App Check integration for Next.js App Router and Cloudflare Workers.

Extracted from [cloudflare-next-intl](https://github.com/demian-ilnytskyi/cloudflare-next-intl).

## Features

- **Edge-Ready Firebase Authentication**: Session verification, cookie sync, and refresh token rotation on Cloudflare Workers / Next.js middleware.
- **Client & Server Providers**: `AuthUserProvider` client context and server-side `getAuthUser()` / `resolveOptionalAuthUser()`.
- **Turnstile & reCAPTCHA App Check**: Server-side App Check token minting with Cloudflare Turnstile challenge provider support.
- **Performance Tracing**: Auto-instrumentation for Firebase Performance Monitoring and Web Vitals.
- **Config Validator**: Static validation of `firebaseAuth` configuration during build/dev (`checkFirebaseAuthConfig`).

## Installation

```bash
npm install cloudflare-next-intl-auth cloudflare-next-intl-intl
```

### Peer Dependencies

```bash
npm install @firebase/app @firebase/auth @firebase/app-check @firebase/performance
```

## Quick Start

In your `@intl-config` routing configuration:

```ts
import { setIntlConfig } from 'cloudflare-next-intl-intl/setIntlConfig';

export default setIntlConfig({
  locales: ['en', 'uk'],
  defaultLocale: 'en',
  firebaseAuth: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path) => path.startsWith('/login'),
  },
});
```

### Turnstile App Check Setup

1. Create an invisible Turnstile widget in Cloudflare dashboard.
2. Add `turnstileSiteKey` and `turnstileSecretKey` to `firebaseAuth.appCheck`:

```ts
firebaseAuth: {
  appCheck: {
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
    clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },
}
```

## Static Config Verification

Use `checkFirebaseAuthConfig` to statically validate your configuration:

```ts
import { checkFirebaseAuthConfig } from 'cloudflare-next-intl-auth/checkFirebaseAuthConfig';

const report = checkFirebaseAuthConfig({ intlConfigPath: 'src/l18n/intl_config.ts' });
```

## Subpath Exports

- `.` — Core auth exports
- `./firebaseAuthClient` — Client SDK getter (`getFirebaseAuthClient`)
- `./firebaseAuthClientProvider` — Client `AuthUserProvider`
- `./firebaseAuthServerProvider` — Server `AuthUserServerProvider`
- `./useFirebaseAuthUser` — Universal hook (client/RSC aware)
- `./getFirebaseAuthUser` — Server session getter
- `./resolveOptionalAuthUser` — Safe user resolver
- `./firebaseAuthActions` — Client authentication actions
- `./firebaseAuthMiddleware` — Session update middleware hook (`updateSession`)
- `./checkFirebaseAuthConfig` — Static config checker
- `./types` — TypeScript definitions
- `./normalizeConfig` — Path normalization utility

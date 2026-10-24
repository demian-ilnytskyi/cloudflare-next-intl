# cloudflare-next-intl-auth

[![npm](https://img.shields.io/npm/v/cloudflare-next-intl-auth.svg)](https://www.npmjs.com/package/cloudflare-next-intl-auth)
[![license](https://img.shields.io/npm/l/cloudflare-next-intl-auth.svg)](./LICENSE)

Firebase Authentication + App Check for the **Next.js App Router** on
**Cloudflare Workers / Pages**. It runs on the edge, verifies sessions on the
server, and stores them in cookies.

Built on [`cloudflare-next-intl-intl`](https://www.npmjs.com/package/cloudflare-next-intl-intl)
and extracted from [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl).
If you use `cloudflare-next-intl`, this package is already included and
auto-wired: set `firebaseAuth` in your config and you're done. Follow the setup
below only if you use `cloudflare-next-intl-intl` on its own.

## Features

- **Edge sessions**: the ID token is verified and the session cookie is synced and refreshed in middleware, with no Firebase Admin SDK.
- **Redirects before render**: guests go to `redirectAuthPath` and signed-in users on auth pages go to `homePath`, before any HTML is sent, so the page doesn't flash.
- **Server + client user**: `getAuthUser()` on the server, `useAuthUser()` on the client, `resolveOptionalAuthUser()` for best-effort logging.
- **Auth actions**: login, sign-up, forgot password, email-link sign-in, email verification, logout.
- **App Check**: reCAPTCHA Enterprise, reCAPTCHA v3, or Cloudflare Turnstile, with server-side token minting.
- **Firebase Performance**: optional auto-instrumentation and Web Vitals.
- **Config checker**: `checkFirebaseAuthConfig` finds config mistakes at build or dev time.
- Firebase is loaded lazily, so it adds no cost to apps that don't configure `firebaseAuth`.

## Installation

```bash
npm install cloudflare-next-intl-auth cloudflare-next-intl-intl
npm install @firebase/app @firebase/auth @firebase/app-check @firebase/performance
```

The Firebase packages are **peer dependencies**. Your app's copy must be the only
one, because `@firebase/app` keeps its app registry in module state.
Installing the full `firebase` package also works.

## Setup

Complete the [`cloudflare-next-intl-intl` setup](https://www.npmjs.com/package/cloudflare-next-intl-intl#setup)
(the `@intl-config` / `@locale-file` aliases) first.

### 1. Add `firebaseAuth` to your `@intl-config`

```ts
// src/i18n/intl_config.ts
import { setIntlConfig } from "cloudflare-next-intl-intl/setIntlConfig";
import type { FirebaseAuthRoutingConfig } from "cloudflare-next-intl-auth/types";

const firebaseAuth: FirebaseAuthRoutingConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    redirectAuthPath: "/login",
    homePath: "/",
    isAuthPath: (path) => path.startsWith("/login") || path.startsWith("/sign-up"),
    // Only these paths require a signed-in user; every other path is public:
    protectedPaths: (path) => path.startsWith("/account"),
};

export default {
    ...setIntlConfig({ locales: ["en", "de"], defaultLocale: "en" }),
    firebaseAuth,
};
```

### 2. Sync the session in middleware

```ts
// src/middleware.ts
import { createIntlMiddleware } from "cloudflare-next-intl-intl/middleware";
import updateSession from "cloudflare-next-intl-auth/firebaseAuthMiddleware";

export const middleware = createIntlMiddleware({
    afterResponse: (response, { request, locale, next }) =>
        updateSession(request, response, locale, next),
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### 3. Wrap your layout with the auth provider

```tsx
// src/app/[locale]/layout.tsx
import { IntlProvider } from "cloudflare-next-intl-intl/server";
import AuthUserServerProvider from "cloudflare-next-intl-auth/firebaseAuthServerProvider";

export default async function RootLayout({ children, params }) {
    const { locale } = await params;
    return (
        <html lang={locale}>
            <body>
                <IntlProvider language={locale}>
                    <AuthUserServerProvider>{children}</AuthUserServerProvider>
                </IntlProvider>
            </body>
        </html>
    );
}
```

`AuthUserServerProvider` validates the session cookie, applies the redirects,
and passes the user to the client `AuthUserProvider`.

## Usage

### Current user on the server

```tsx
import { getAuthUser } from "cloudflare-next-intl-auth/getFirebaseAuthUser";

export default async function AccountPage() {
    const { user } = await getAuthUser();
    return <p>{user?.email}</p>;
}
```

Use `getAuthUser()` whenever the page output depends on the user, which also
makes the page dynamic. To attach the user only when it happens to be known
(for error reporting, analytics, or logs), use
`resolveOptionalAuthUser()` from `cloudflare-next-intl-auth/resolveOptionalAuthUser`.
It never throws and resolves `{ user: null }` when there is no session.

### Current user on the client

```tsx
"use client";
import useAuthUser from "cloudflare-next-intl-auth/useFirebaseAuthUser";

export function UserMenu() {
    const { user, loading, logout, sendVerificationEmail } = useAuthUser();
    if (loading) return null;
    return user ? <button onClick={logout}>Log out {user.email}</button> : null;
}
```

`cloudflare-next-intl-auth/useFirebaseAuthUser` uses the server version in
Server Components and the client hook everywhere else.

### Auth actions

```tsx
"use client";
import { useActionState } from "react";
import { useLocale } from "cloudflare-next-intl-intl/use";
import { createLoginAction } from "cloudflare-next-intl-auth/firebaseAuthActions";

export function LoginForm({ messages }) {
    const locale = useLocale();
    const [state, action, pending] = useActionState(createLoginAction(locale, messages), {});
    return (
        <form action={action}>
            <input name="email" type="email" />
            <input name="password" type="password" />
            <button disabled={pending}>Sign in</button>
        </form>
    );
}
```

Also available: `createSignUpAction`, `createForgotPasswordAction`,
`createSendSignInLinkAction`, `completeSignInWithLink`. To use the Firebase SDK
directly, `getFirebaseAuthClient()` (`./firebaseAuthClient`) returns the
initialized `auth` instance, with App Check set up when configured.

### App Check

Add `appCheck` to `firebaseAuth` with one provider.

```ts
appCheck: {
    // pick one provider:
    recaptchaEnterpriseSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY,
    // recaptchaV3SiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_V3_KEY,
    // turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    // turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,

    // Service account for server-side token minting (required for Turnstile):
    clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}
```

To use Turnstile, create an **invisible** widget in the Cloudflare dashboard and set both Turnstile keys.

### Useful `firebaseAuth` options

| Option | Purpose |
| --- | --- |
| `protectedPaths(path)` | Only these paths require a signed-in user. Prefer it over `whiteListPaths` when most pages are public. |
| `whiteListPaths` | Paths that skip auth redirects (exact match or path-segment prefix). |
| `verifyEmailPath`, `resetPasswordPath`, `actionLinkPath` | Routes for Firebase email action links. |
| `followSameOriginContinueUrl` | Redirect action links to their `continueUrl` (default `true`). |
| `skipPopupRedirectResolver` | Don't load the auth iframe on page load; pass `browserPopupRedirectResolver` when you call the sign-in function. |
| `middlewareEnabled` | Set to `false` to keep the config but skip session sync in middleware. |
| `performance` | Enable Firebase Performance Monitoring. |
| `onSignIn`, `onSignOut`, `onEmailVerified` | Client lifecycle callbacks. |
| `sessionCookieMaxAge`, `sessionCookieName`, ... | Cookie tuning. |

The `FirebaseAuthRoutingConfig` JSDoc documents every option.

### Check the config

```ts
import { checkFirebaseAuthConfig } from "cloudflare-next-intl-auth/checkFirebaseAuthConfig";

const report = checkFirebaseAuthConfig({ intlConfigPath: "src/i18n/intl_config.ts" });
```

Without running your app, this reports missing leading slashes, a `homePath`
that matches `isAuthPath` (a redirect loop), unreachable action paths, and similar mistakes.

## Public subpath exports

| Subpath | Contents |
| --- | --- |
| `.` | Barrel: providers, actions, `getFirebaseAuthClient`, `updateFirebaseAuthSession`, types |
| `./firebaseAuthMiddleware` | default `updateSession` |
| `./firebaseAuthServerProvider` | `AuthUserServerProvider`, `resolveAuthUserAndRedirect` |
| `./firebaseAuthClientProvider` | Client `AuthUserProvider` |
| `./useFirebaseAuthUser` | `useAuthUser` (works in Server and Client Components) |
| `./getFirebaseAuthUser` | `getAuthUser` |
| `./resolveOptionalAuthUser` | `resolveOptionalAuthUser`, `resolveErrorReportingUser` |
| `./firebaseAuthActions` | Login / sign-up / reset / email-link actions |
| `./firebaseAuthClient` | `getFirebaseAuthClient` |
| `./checkFirebaseAuthConfig` | Config checker |
| `./normalizeConfig` | `normalizeFirebaseAuthConfig` |
| `./types` | `FirebaseAuthRoutingConfig`, `AuthUser`, ... |

`./internal/*` subpaths are only for `cloudflare-next-intl`; don't import them in your app.

## Related packages

- [`cloudflare-next-intl-intl`](https://www.npmjs.com/package/cloudflare-next-intl-intl): the i18n core (required).
- [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl): all-in-one package with auth auto-wired.

## License

MIT

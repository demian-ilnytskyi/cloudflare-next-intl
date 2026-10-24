# cloudflare-next-intl-theme

[![npm](https://img.shields.io/npm/v/cloudflare-next-intl-theme.svg)](https://www.npmjs.com/package/cloudflare-next-intl-theme)
[![license](https://img.shields.io/npm/l/cloudflare-next-intl-theme.svg)](./LICENSE)

Light/dark theme for the **Next.js App Router**, with **no flash of the wrong theme**.
It works on Cloudflare Workers / Pages, static export, and any other host.

Part of the [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl)
family. That package already includes this one and adds `ThemeScript` for you,
so with it you only need `ThemeSwitcher`. Use this package on its own when you
only want theming.

## Features

- **No flicker:** a small inline `<head>` script sets the `dark` class on `<html>` before the first paint.
- **Remembers the choice** in a cookie (`__is_dark_key__`, 1 year). On the first visit it follows `prefers-color-scheme`.
- **Stays in sync** after client-side navigation (`pushState` / `replaceState` / back).
- **Ready-made toggle:** an animated sun/moon `ThemeSwitcher` button styled with Tailwind, plus an unstyled `ThemeSwitcherButton` for your own design.
- **Zero runtime dependencies**, tree-shakeable subpath exports.

## Installation

```bash
npm install cloudflare-next-intl-theme
```

Peer dependencies: `next` (>= 12) and `react` (>= 16.8).

## Setup

### 1. Add `ThemeScript` to `<head>`

```tsx
// src/app/layout.tsx
import ThemeScript from "cloudflare-next-intl-theme/ThemeScript";

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <ThemeScript />
            </head>
            <body>{children}</body>
        </html>
    );
}
```

`suppressHydrationWarning` is needed because the script changes `<html>`'s
`class` before React hydrates.

### 2. Use class-based dark mode in your CSS

Every theme style keys off the `dark` class on `<html>`.

Tailwind v4:

```css
/* globals.css */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

Tailwind v3: set `darkMode: "class"` in `tailwind.config`.

Plain CSS:

```css
:root { --bg: #fff; --fg: #111; }
:root.dark { --bg: #111; --fg: #fff; }
```

## Usage

### Ready-made toggle

```tsx
import ThemeSwitcher from "cloudflare-next-intl-theme/ThemeSwitcher";

<ThemeSwitcher lightLabelText="Switch to light mode" darkLabelText="Switch to dark mode" />
```

| Prop | Type | Description |
| --- | --- | --- |
| `lightLabelText` | `string` | `aria-label` while in dark mode (the button switches to light). |
| `darkLabelText` | `string` | `aria-label` while in light mode (the button switches to dark). |
| `className` | `string?` | Extra classes for the button. |

`ThemeSwitcher` can be rendered from Server Components. Its built-in styles
use Tailwind classes, so it needs Tailwind with the dark variant from step 2.

### Your own button

`ThemeSwitcherButton` is a client component. It handles the toggle, the cookie
and the `aria-label`; you supply the content:

```tsx
import ThemeSwitcherButton from "cloudflare-next-intl-theme/ThemeSwitcherButton";
import { Sun, Moon } from "cloudflare-next-intl-theme";

<ThemeSwitcherButton lightLabelText="Light" darkLabelText="Dark" className="my-btn">
    <Sun className="dark:hidden" />
    <Moon className="hidden dark:block" />
</ThemeSwitcherButton>
```

To control everything yourself, toggle the class and save the choice:

```ts
"use client";
import { setThemeCookie } from "cloudflare-next-intl-theme";

const isDark = !document.documentElement.classList.contains("dark");
document.documentElement.classList.toggle("dark", isDark);
setThemeCookie(isDark);
```

### Reading the theme on the server

```ts
import { cookies } from "next/headers";
import { isDarkCookieKey } from "cloudflare-next-intl-theme/cookieKey";

const isDark = (await cookies()).get(isDarkCookieKey)?.value === "true";
```

Reading cookies makes the route dynamic. Prefer the `dark` class in CSS where
you can.

### `ClientThemeScript`

`ClientThemeScript` is a client component that re-applies the cookie's theme
after hydration. Render it once inside your client provider tree when parts of
your app replace `<html>` attributes on the client. Most apps don't need it.

## Exports

| Subpath | Contents |
| --- | --- |
| `.` | `ThemeSwitcher`, `ThemeSwitcherButton`, `ThemeScript`, `ClientThemeScript`, `setThemeCookie`, `isDarkCookieKey`, `Sun`, `Moon` |
| `./ThemeSwitcher` | default `ThemeSwitcher` |
| `./ThemeSwitcherButton` | default `ThemeSwitcherButton` (`"use client"`) |
| `./ThemeScript` | default `ThemeScript` (server-safe) |
| `./ClientThemeScript` | default `ClientThemeScript` (`"use client"`) |
| `./cookieKey` | `isDarkCookieKey` (`"__is_dark_key__"`) |

## Related packages

- [`cloudflare-next-intl`](https://www.npmjs.com/package/cloudflare-next-intl): all-in-one package with the theme auto-wired.
- [`cloudflare-next-intl-intl`](https://www.npmjs.com/package/cloudflare-next-intl-intl): localization core.

## License

MIT

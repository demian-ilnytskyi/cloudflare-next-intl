# Theme Switcher — `package/src/theme_switcher/**`

Small, self-contained module: `theme_switcher.tsx` (the public
`ThemeSwitcher` component) composes `theme_switcher_button.tsx` (stateful
button, reads/writes the `dark` class on `document.documentElement` plus the
`isDarkCookieKey` cookie via `client/functions/set_cookie.ts`) with
`icons.tsx`'s `Sun`/`Moon` SVGs.

- State is NOT centralized in React state/context beyond the button's own
  `useState` — the actual persisted state lives in the DOM class
  (`document.documentElement.classList.contains('dark')`) and the cookie.
  The button's `useState` just mirrors the DOM class on mount for the
  `aria-label` text; it is not the source of truth.
- See [`docs/ai/client.md`](client.md)'s "Theme cookie flow" section — this
  module is one of three places that read/write `isDarkCookieKey` and must
  stay consistent with the other two if you change the cookie contract.
- Tailwind-style utility classes are hardcoded as string concatenation
  directly in the component (not extracted to a shared constant) — this
  matches the existing style in this file, don't refactor to a CSS module or
  extract classes without checking whether the package intends to stay
  framework-agnostic on styling (it currently assumes the consumer has
  Tailwind's `dark:` variant configured).

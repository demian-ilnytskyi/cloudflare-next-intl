/**
 * Server component exported as `IntlHelperScript` from
 * `cloudflare-next-intl/IntlHelperScript`. Renders inline bootstrap
 * `<script>` tags that run before hydration to avoid FOUC/flicker:
 * - syncs dark-mode class from the theme cookie (or `prefers-color-scheme`)
 * - redirects to the locale-prefixed URL if the locale cookie disagrees
 *   with the current path (covers client-side navigation edge cases)
 * - (prod only) checks `BUILD_ID` and force-reloads on stale deploys
 *
 * Place it once in your root layout's `<head>`, alongside `IntlProvider`.
 * No props.
 *
 * @example
 * ```tsx
 * <head>
 *   <IntlHelperScript />
 * </head>
 * ```
 */
export default function HelperScript(): Component | null;

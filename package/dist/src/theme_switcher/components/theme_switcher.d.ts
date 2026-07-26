/**
 * Light/dark theme toggle button, exported as `ThemeSwitcher` from
 * `cloudflare-next-intl/ThemeSwitcher`. Persists the choice via the
 * theme cookie this package's `IntlHelperScript` reads on load (so the
 * correct theme applies before hydration, no flash).
 *
 * @param lightLabelText Accessible label shown/used when in light mode.
 * @param darkLabelText  Accessible label shown/used when in dark mode.
 * @param className      Optional class applied to the underlying button.
 */
export default function ThemeSwticher(params: {
    className?: string;
    lightLabelText: string;
    darkLabelText: string;
}): Component;

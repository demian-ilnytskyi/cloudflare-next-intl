import { Moon, Sun } from "./icons.js";
import ThemeSwticherButton from "./theme_switcher_button.js";


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
}): Component {

    return <ThemeSwticherButton {...params}>
        <Sun
            className={
                "transition-transform duration-500 ease-in-out" +
                " rotate-0 scale-100 opacity-100 cursor-pointer" + // Default (light mode) state
                " dark:rotate-90 dark:scale-0 dark:opacity-0" + // Dark mode state
                " dark:w-0 dark:h-0 h-max w-max"
            }
        />
        {/* Moon Icon for Dark Mode */}
        <Moon
            className={
                "transition-transform duration-500 ease-in-out" +
                " -rotate-90 scale-0 opacity-0 cursor-pointer" + // Default (light mode) state
                " dark:rotate-0 dark:scale-100 dark:opacity-100" + // Dark mode state
                " w-0 h-0 dark:h-max dark:w-max"
            }
        />
    </ThemeSwticherButton>;
}
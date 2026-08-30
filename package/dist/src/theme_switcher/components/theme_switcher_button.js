"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { isDarkCookieKey } from "../../config/cookie_key.js";
import setCookie from "../../client/functions/set_cookie.js";
export default function ThemeSwticherButton({ className, lightLabelText, darkLabelText, children, }) {
    const [isDarkMode, setDarkMode] = useState(false);
    useEffect(() => {
        setDarkMode(document.documentElement.classList.contains('dark'));
    }, []);
    function changeTheme() {
        const isDark = document.documentElement.classList.contains('dark');
        document.documentElement.classList.toggle('dark', !isDark);
        setDarkMode(!isDark);
        setCookie({ name: isDarkCookieKey, value: !isDark });
    }
    return _jsx("button", { onClick: changeTheme, "aria-label": isDarkMode ? lightLabelText : darkLabelText, className: "relative flex items-center justify-center" + // Base flex container for centering content
            " p-2.5 aspect-square h-11.5 rounded-full cursor-pointer overflow-hidden" + // Hide overflow for potential animations, pointer cursor
            " transition-colors duration-300 ease-in-out" + // Smooth transition for background color
            " outline-none ring-2 ring-offset-2 ring-opacity-75" + // Focus ring for accessibility
            " bg-gradient-to-br from-blue-300 to-blue-500 text-yellow-500 shadow-lg shadow-blue-500/50 ring-green-500" + // Light mode default
            " dark:from-gray-700 dark:to-gray-900 dark:text-yellow-300 dark:shadow-gray-900/50 dark:ring-yellow-500 " + // Dark mode styles
            className // Custom classes passed via props
        , children: children });
}

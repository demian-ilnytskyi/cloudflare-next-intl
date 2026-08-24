"use client";

import reportError from "../../error_handling/report_error";

/**
 * Client-only: reads a `document.cookie` value by name. Pairs with
 * {@link setCookie} for your OWN client-side cookies — this package's
 * locale/theme cookies are managed internally, you don't need this for those.
 *
 * @param name Cookie name to look up.
 * @returns The decoded cookie value, or `null` if not found (or on error,
 *   logged instead of thrown).
 */
export default function getCookie(name: string): string | null {
    try {
        const cookie = document.cookie;
        const prefix = `${name}=`;
        let start = -1;

        if (cookie.startsWith(prefix)) {
            start = prefix.length;
        } else {
            const idx = cookie.indexOf(`; ${prefix}`);
            if (idx !== -1) start = idx + 2 + prefix.length;
        }

        if (start === -1) return null;

        const end = cookie.indexOf(';', start);
        const value = end === -1 ? cookie.slice(start) : cookie.slice(start, end);
        return decodeURIComponent(value);
    } catch (e) {
        void reportError(undefined, {
            error: e,
            classOrMethodName: 'getCookie',
            isClient: true,
            params: { name },
        });
        return null;
    }
};

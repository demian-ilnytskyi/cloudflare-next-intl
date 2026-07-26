"use client";

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
        const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
        console.error(`Get cookie on client side error: ${e}`);
        return null;
    }
};

"use client";

import reportError from "../../error_handling/report_error";

/**
 * Client-only: sets a `document.cookie` value directly. Not used by this
 * package's own locale handling (that goes through `intlMiddleware` server-side)
 * — this is a small utility for your OWN client-side cookies (e.g. a
 * "dismissed banner" flag).
 *
 * @param name   Cookie name.
 * @param value  Cookie value; stringified via template literal (no encoding
 *   applied — avoid values containing `;`). Must be a primitive
 *   (`string`/`number`/`boolean`) — objects would silently serialize to
 *   `"[object Object]"`.
 * @param maxAge Seconds until expiry. Defaults to 1 year.
 *
 * Always `path=/; SameSite=Lax`. Swallows errors (e.g. in restrictive
 * environments) and logs them instead of throwing.
 */
export default function setCookie({ name, value, maxAge }: { name: string, value: string | number | boolean, maxAge?: number }): void {
    try {
        const cookieString = `${name}=${value}; path=/; max-age=${maxAge ?? 31536000}; SameSite=Lax;`;

        document.cookie = cookieString;
    } catch (e) {
        void reportError(undefined, {
            error: e,
            classOrMethodName: 'setCookie',
            isClient: true,
            params: { name },
        });
    }
};

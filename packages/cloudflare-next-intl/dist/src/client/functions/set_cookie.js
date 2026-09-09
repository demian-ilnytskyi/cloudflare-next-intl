"use client";
import reportError from "../../error_handling/report_error.js";
export default function setCookie({ name, value, maxAge }) {
    try {
        const cookieString = `${name}=${value}; path=/; max-age=${maxAge ?? 31536000}; SameSite=Lax;`;
        document.cookie = cookieString;
    }
    catch (e) {
        void reportError(undefined, {
            error: e,
            classOrMethodName: 'setCookie',
            isClient: true,
            params: { name },
        });
    }
}
;

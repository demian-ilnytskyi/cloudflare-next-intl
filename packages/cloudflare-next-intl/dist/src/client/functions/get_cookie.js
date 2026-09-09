"use client";
import reportError from "../../error_handling/report_error.js";
export default function getCookie(name) {
    try {
        const cookie = document.cookie;
        const prefix = `${name}=`;
        let start = -1;
        if (cookie.startsWith(prefix)) {
            start = prefix.length;
        }
        else {
            const idx = cookie.indexOf(`; ${prefix}`);
            if (idx !== -1)
                start = idx + 2 + prefix.length;
        }
        if (start === -1)
            return null;
        const end = cookie.indexOf(';', start);
        const value = end === -1 ? cookie.slice(start) : cookie.slice(start, end);
        return decodeURIComponent(value);
    }
    catch (e) {
        void reportError(undefined, {
            error: e,
            classOrMethodName: 'getCookie',
            isClient: true,
            params: { name },
        });
        return null;
    }
}
;

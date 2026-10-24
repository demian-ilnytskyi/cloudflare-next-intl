'use client';

import { useEffect } from 'react';
import { isDarkCookieKey } from './cookie_key.js';

export default function ClientThemeScript(): null {
    useEffect(() => {
        const match = document.cookie.match(new RegExp(`(?:^|; )${isDarkCookieKey}=([^;]*)`));
        const isDark = match ? decodeURIComponent(match[1]) : null;

        const classList = document.documentElement.classList;
        const isDarkBool = isDark === 'true';

        if (classList.contains('dark') !== isDarkBool) {
            classList.toggle('dark', isDarkBool);
        }
    }, []);

    return null;
}
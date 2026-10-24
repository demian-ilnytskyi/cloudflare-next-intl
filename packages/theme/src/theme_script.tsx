import React from 'react';
import { isDarkCookieKey } from './cookie_key.js';

export default function ThemeScript(): React.JSX.Element {
    return (
        <script
            id="cfni-theme"
            dangerouslySetInnerHTML={{
                __html: `(function() {
                try {
                    const getCookie = (name) => {
                        try {
                            const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
                            return match ? decodeURIComponent(match[1]) : null;
                        } catch (e) {
                            return null;
                        }
                    };

                    function setTheme(isDark) {
                        try {
                            const classList = document.documentElement.classList;
                            if (classList.contains('dark') !== isDark) {
                                classList.toggle('dark', isDark);
                            }
                        } catch (e) {}
                    }

                    function syncTheme() {
                        const isDark = getCookie('${isDarkCookieKey}');
                        setTheme(isDark === 'true');
                    }

                    const isDark = getCookie('${isDarkCookieKey}');
                    if (isDark === null) {
                        let prefersDark = false;
                        try {
                            prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                        } catch (e) {}
                        setTheme(prefersDark);
                        try {
                            document.cookie = '${isDarkCookieKey}=' +
                                prefersDark +
                                '; path=/; max-age=31536000; SameSite=Lax;';
                        } catch (e) {}
                    } else {
                        setTheme(isDark === 'true');
                    }

                    try {
                        const pushState = history.pushState;
                        const replaceState = history.replaceState;
                        const back = history.back;

                        history.back = function (...args) {
                            try { back.apply(history, args); } catch (e) {}
                        };
                        history.pushState = function (...args) {
                            try { pushState.apply(history, args); } catch (e) {}
                            try { syncTheme(); } catch (e) {}
                        };
                        history.replaceState = function (...args) {
                            try { replaceState.apply(history, args); } catch (e) {}
                            try { syncTheme(); } catch (e) {}
                        };
                    } catch (e) {}
                } catch (e) {
                    try { console.error('Theme Script Error:', e); } catch (e2) {}
                }
            })();`,
            }}
        />
    );
}

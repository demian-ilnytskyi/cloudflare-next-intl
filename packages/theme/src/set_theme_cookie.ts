import { isDarkCookieKey } from './cookie_key.js';

export default function setThemeCookie(isDark: boolean): void {
    try {
        document.cookie = `${isDarkCookieKey}=${isDark}; path=/; max-age=31536000; SameSite=Lax;`;
    } catch {
        // Swallows errors (e.g. in environments where document.cookie is restricted)
    }
}

import { describe, it, expect, beforeEach, vi } from 'vitest';
import setThemeCookie from './set_theme_cookie.js';
import { isDarkCookieKey } from './cookie_key.js';

describe('setThemeCookie', () => {
    beforeEach(() => {
        document.cookie = `${isDarkCookieKey}=; path=/; max-age=0;`;
    });

    it('writes __is_dark_key__=true with path=/', () => {
        setThemeCookie(true);
        expect(document.cookie).toContain(`${isDarkCookieKey}=true`);
    });

    it('writes __is_dark_key__=false with path=/', () => {
        setThemeCookie(false);
        expect(document.cookie).toContain(`${isDarkCookieKey}=false`);
    });

    it('swallows errors when document.cookie throws', () => {
        const spy = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
            throw new Error('access denied');
        });
        expect(() => setThemeCookie(true)).not.toThrow();
        spy.mockRestore();
    });
});

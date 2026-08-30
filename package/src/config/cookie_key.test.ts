import { describe, it, expect } from 'vitest';
import { localeCookieName, isBotCookieKey, isDarkCookieKey } from './cookie_key.js';

describe('cookie_key constants', () => {
    it('exports distinct, stable cookie names', () => {
        expect(localeCookieName).toBe('__user_locale_key__');
        expect(isBotCookieKey).toBe('__is_bot_key__');
        expect(isDarkCookieKey).toBe('__is_dark_key__');
    });
});

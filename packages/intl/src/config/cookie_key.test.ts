import { describe, it, expect } from 'vitest';
import { localeCookieName, isBotCookieKey, countryCookieKey, timezoneCookieKey } from './cookie_key.js';

describe('cookie_key constants', () => {
    it('exports distinct, stable cookie names', () => {
        expect(localeCookieName).toBe('__user_locale_key__');
        expect(isBotCookieKey).toBe('__is_bot_key__');
        expect(countryCookieKey).toBe('__cf_country__');
        expect(timezoneCookieKey).toBe('__cf_timezone__');
    });
});

import { bench, describe } from 'vitest';
import { localeCookieName, isBotCookieKey, countryCookieKey, timezoneCookieKey } from './cookie_key.js';

describe('cookie_key constants', () => {
    bench('reads the exported constant references', () => {
        void localeCookieName;
        void isBotCookieKey;
        void countryCookieKey;
        void timezoneCookieKey;
    });
});

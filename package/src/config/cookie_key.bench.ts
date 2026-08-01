import { bench, describe } from 'vitest';
import { localeCookieName, isBotCookieKey, isDarkCookieKey } from './cookie_key';

describe('cookie_key constants', () => {
    bench('reads the exported constant references', () => {
        void localeCookieName;
        void isBotCookieKey;
        void isDarkCookieKey;
    });
});

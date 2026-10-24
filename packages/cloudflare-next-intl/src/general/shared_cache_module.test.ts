import { describe, it, expect } from 'vitest';
import {
    setLocaleCache as intlSetLocaleCache,
    getLocaleCache as intlGetLocaleCache,
    setMessageForLocaleCache as intlSetMessageCache,
    getMessageCache as intlGetMessageCache,
} from 'cloudflare-next-intl-intl/internal/cacheVariables';
import {
    setLocaleCache as umbrellaSetLocaleCache,
    getLocaleCache as umbrellaGetLocaleCache,
    setMessageForLocaleCache as umbrellaSetMessageCache,
    getMessageCache as umbrellaGetMessageCache,
} from './cache_variables.js';

describe('shared translation and locale cache module singleton', () => {
    it('shares memory between core intl package and umbrella re-exports without mocks', () => {
        intlSetLocaleCache('uk');
        expect(umbrellaGetLocaleCache()).toBe('uk');

        const ukMessages = { Common: { ok: 'Гаразд' } };
        intlSetMessageCache('uk', ukMessages);
        expect(umbrellaGetMessageCache('uk')).toEqual(ukMessages);

        umbrellaSetLocaleCache('en');
        expect(intlGetLocaleCache()).toBe('en');

        const enMessages = { Common: { ok: 'OK' } };
        umbrellaSetMessageCache('en', enMessages);
        expect(intlGetMessageCache('en')).toEqual(enMessages);
    });
});

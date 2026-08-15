import { bench, describe } from 'vitest';
import { setLocaleCache, getLocaleCache, setMessageForLocaleCache, getMessageCache, setTranslationCache, getTranslationCache, } from './cache_variables';
describe('cache_variables', () => {
    bench('setLocaleCache + getLocaleCache round-trip', () => {
        setLocaleCache('en');
        getLocaleCache();
    });
    bench('setMessageForLocaleCache + getMessageCache hit', () => {
        setMessageForLocaleCache('en', { common: { hello: 'Hello' } });
        getMessageCache('en');
    });
    bench('getMessageCache miss (no locale provided)', () => {
        getMessageCache(undefined);
    });
    bench('setTranslationCache + getTranslationCache hit', () => {
        const fn = (k) => k;
        fn.raw = (k) => k;
        setTranslationCache('en-common', fn);
        getTranslationCache('en-common');
    });
});

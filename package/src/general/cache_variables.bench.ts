import { bench, describe } from 'vitest';
import {
    setLocaleCache,
    getLocaleCache,
    setMessageForLocaleCache,
    getMessageCache,
    setTranslationCache,
    getTranslationCache,
} from './cache_variables.js';

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
        const fn = (k: string) => k;
        (fn as unknown as { raw: (k: string) => string }).raw = (k: string) => k;
        setTranslationCache('en-common', fn as unknown as import('../types/types.js').TranslatorReturnType);
        getTranslationCache('en-common');
    });
});

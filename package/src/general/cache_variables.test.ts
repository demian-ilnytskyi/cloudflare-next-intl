import { describe, it, expect } from 'vitest';
import {
    setLocaleCache,
    setLocaleAsync,
    getLocaleCache,
    setMessageForLocaleCache,
    getMessageCache,
    setTranslationCache,
} from './cache_variables';

describe('cache_variables', () => {
    it('sets and gets the current locale', () => {
        setLocaleCache('en');
        expect(getLocaleCache()).toBe('en');
    });

    it('sets the locale asynchronously from a params promise', async () => {
        await setLocaleAsync(Promise.resolve({ locale: 'de' }));
        expect(getLocaleCache()).toBe('de');
    });

    it('stores and retrieves messages for a locale', () => {
        const messages = { Common: { title: 'Hi' } };
        setMessageForLocaleCache('en', messages);
        expect(getMessageCache('en')).toBe(messages);
    });

    it('returns undefined for an unknown locale', () => {
        expect(getMessageCache('xx')).toBeUndefined();
    });

    it('returns undefined when no locale is passed', () => {
        expect(getMessageCache(undefined)).toBeUndefined();
    });

    it('stores a translation function without throwing', () => {
        // No exported getter exists for translationFunctionsCache, so the
        // round-trip cannot be asserted directly; this only verifies storage
        // doesn't throw.
        const fn = (k: string) => k;
        expect(() => setTranslationCache('en-Common', fn)).not.toThrow();
    });
});

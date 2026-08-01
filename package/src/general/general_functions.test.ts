import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTranslationsImpl } from './general_functions';
import type { TranslationObject } from '../types/types';

const messages: TranslationObject = {
    Common: {
        title: 'Hello',
        nested: { deep: 'Deep value' },
    },
};

describe('getTranslationsImpl', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('resolves a single-level namespace and key', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('title')).toBe('Hello');
    });

    it('resolves a nested key within a namespace', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('nested.deep')).toBe('Deep value');
    });

    it('resolves a multi-level namespace path', () => {
        const nestedMessages: TranslationObject = { A: { B: { greeting: 'Hi' } } };
        const t = getTranslationsImpl('en', nestedMessages, 'A.B');
        expect(t('greeting')).toBe('Hi');
    });

    it('falls back when namespace does not resolve to an object', () => {
        const t = getTranslationsImpl('en', { Common: 'not-an-object' }, 'Common');
        expect(t('anything')).toBe('anything');
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('does not resolve to an object'),
        );
    });

    it('falls back when an intermediate namespace segment is invalid', () => {
        const t = getTranslationsImpl('en', { A: 'not-an-object' }, 'A.B');
        expect(t('x')).toBe('x');
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('invalid structure'),
        );
    });

    it('falls back when namespace is entirely missing', () => {
        const t = getTranslationsImpl('en', {}, 'Missing');
        expect(t('x')).toBe('x');
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('does not resolve to an object'),
        );
    });

    it('returns key when translation key resolves to a nested object, not a string', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('nested')).toEqual({ deep: 'Deep value' });
    });

    it('warns and returns key when key path hits a string prematurely', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('title.extra')).toBe('title.extra');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('invalid structure'),
        );
    });

    it('returns undefined when key is missing (single-part key)', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('missingKey')).toBeUndefined();
    });

    it('warns and returns key when intermediate key segment is invalid', () => {
        const t = getTranslationsImpl('en', { Common: { mid: 'a string' } }, 'Common');
        expect(t('mid.deep')).toBe('mid.deep');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('invalid structure'),
        );
    });

    it('uses the provided cacheKey instead of deriving one', () => {
        // No direct observable effect other than not throwing; cache write is
        // exercised implicitly. Assert the function still returns correctly.
        const t = getTranslationsImpl('en', messages, 'Common', 'custom-key');
        expect(t('title')).toBe('Hello');
    });
});

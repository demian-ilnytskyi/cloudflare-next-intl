import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTranslationsImpl } from './general_functions';
import { setTranslationCache } from './cache_variables';
import type { TranslationObject } from '../types/types';

vi.mock('./cache_variables', () => ({
    setTranslationCache: vi.fn(),
}));

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
        expect(t('nested')).toBe('nested');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('resolves to a non-string value'),
        );
    });

    it('warns and returns key when key path hits a string prematurely', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('title.extra')).toBe('title.extra');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('invalid structure'),
        );
    });

    it('returns key when key is missing (single-part key)', () => {
        const t = getTranslationsImpl('en', messages, 'Common');
        expect(t('missingKey')).toBe('missingKey');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('resolves to a non-string value'),
        );
    });

    it('warns and returns key when intermediate key segment is invalid', () => {
        const t = getTranslationsImpl('en', { Common: { mid: 'a string' } }, 'Common');
        expect(t('mid.deep')).toBe('mid.deep');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('invalid structure'),
        );
    });

    it('falls back when namespace is an empty string', () => {
        const t = getTranslationsImpl('en', messages, '');
        expect(t('anything')).toBe('anything');
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('does not resolve to an object'),
        );
    });

    it('uses the provided cacheKey instead of deriving one', () => {
        vi.mocked(setTranslationCache).mockClear();
        getTranslationsImpl('en', messages, 'Common', 'custom-key');
        expect(setTranslationCache).toHaveBeenCalledWith('custom-key', expect.any(Function));
        expect(setTranslationCache).not.toHaveBeenCalledWith('en-Common', expect.any(Function));
    });

    describe('t.raw', () => {
        const rawMessages: TranslationObject = {
            Common: {
                title: 'Hello',
                items: ['a', 'b', 'c'],
                nested: { deep: 'Deep value', list: ['x', 'y'] },
            },
        };

        it('returns a string value unchanged', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('title')).toBe('Hello');
        });

        it('returns an array value unchanged', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('items')).toEqual(['a', 'b', 'c']);
        });

        it('returns a nested object value unchanged', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('nested')).toEqual({ deep: 'Deep value', list: ['x', 'y'] });
        });

        it('resolves a dot-separated key into a nested array', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('nested.list')).toEqual(['x', 'y']);
        });

        it('resolves a dot-separated key into a nested string', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('nested.deep')).toBe('Deep value');
        });

        it('warns and returns key when key is missing', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('missingKey')).toBe('missingKey');
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('is missing for locale'),
            );
        });

        it('warns and returns key when an intermediate segment is invalid', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('title.extra')).toBe('title.extra');
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('invalid structure'),
            );
        });

        it('warns and returns key when the path leads through an array prematurely', () => {
            const t = getTranslationsImpl('en', rawMessages, 'Common');
            expect(t.raw('items.0')).toBe('items.0');
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('leads to a non-object prematurely'),
            );
        });
    });
});

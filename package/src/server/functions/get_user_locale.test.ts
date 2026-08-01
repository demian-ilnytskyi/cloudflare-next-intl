import { describe, it, expect, vi, beforeEach } from 'vitest';
import { languageDetecotr } from './get_user_locale';

describe('languageDetecotr', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('returns default locale when header is null', () => {
        expect(languageDetecotr(null)).toBe('en');
    });

    it('picks the highest-q supported locale', () => {
        expect(languageDetecotr('fr;q=0.5,de;q=0.9,en;q=0.8')).toBe('de');
    });

    it('defaults unspecified q to 1', () => {
        expect(languageDetecotr('de,en;q=0.9')).toBe('de');
    });

    it('matches on the base language, ignoring region subtags', () => {
        expect(languageDetecotr('de-DE')).toBe('de');
    });

    it('falls back to default locale when no listed language is supported', () => {
        expect(languageDetecotr('fr-FR,es;q=0.8')).toBe('en');
    });

    it('does not overwrite a higher-q match with a later lower-q one', () => {
        expect(languageDetecotr('de;q=0.9,en;q=0.5')).toBe('de');
    });

    it('catches unexpected errors during parsing and returns default locale', () => {
        const original = String.prototype.trim;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (String.prototype as any).trim = () => { throw new Error('boom'); };
        try {
            expect(languageDetecotr('de')).toBe('en');
        } finally {
            String.prototype.trim = original;
        }
    });
});

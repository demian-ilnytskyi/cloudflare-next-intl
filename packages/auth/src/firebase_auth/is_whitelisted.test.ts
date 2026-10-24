import { describe, it, expect } from 'vitest';
import isWhitelisted from './is_whitelisted.js';

describe('isWhitelisted', () => {
    it('returns false when whiteListPaths is undefined', () => {
        expect(isWhitelisted('/bonds', undefined)).toBe(false);
    });

    it('matches an exact entry', () => {
        expect(isWhitelisted('/bonds', ['/bonds'])).toBe(true);
    });

    it('matches a path-segment prefix', () => {
        expect(isWhitelisted('/bonds/some-slug', ['/bonds'])).toBe(true);
        expect(isWhitelisted('/bonds/some-slug/nested', ['/bonds'])).toBe(true);
    });

    it('does NOT match a differently-named sibling route sharing a prefix', () => {
        expect(isWhitelisted('/bonds-extra', ['/bonds'])).toBe(false);
    });

    it('does not match an unrelated path', () => {
        expect(isWhitelisted('/login', ['/bonds', '/inflation'])).toBe(false);
    });

    it('matches against any entry in a multi-entry list', () => {
        expect(isWhitelisted('/inflation/2024', ['/bonds', '/inflation', '/articles'])).toBe(true);
    });

    it('does not match when path is a strict prefix of the entry itself (no boundary char)', () => {
        expect(isWhitelisted('/bond', ['/bonds'])).toBe(false);
    });

    it('matches a single-character path segment right after the entry', () => {
        expect(isWhitelisted('/bonds/a', ['/bonds'])).toBe(true);
    });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import getCookie from './get_cookie.js';

describe('getCookie', () => {
    beforeEach(() => {
        document.cookie.split(';').forEach((c) => {
            const name = c.split('=')[0]?.trim();
            if (name) document.cookie = `${name}=; max-age=0; path=/`;
        });
    });

    it('returns the decoded value of an existing cookie', () => {
        document.cookie = 'foo=bar%20baz';
        expect(getCookie('foo')).toBe('bar baz');
    });

    it('returns null when the cookie is not present', () => {
        expect(getCookie('missing')).toBeNull();
    });

    it('returns value when cookie is last with no trailing semicolon', () => {
        document.cookie = 'a=1';
        document.cookie = 'b=2';
        expect(getCookie('b')).toBe('2');
    });

    it('returns value when cookie is followed by another cookie', () => {
        document.cookie = 'a=1';
        document.cookie = 'b=2';
        expect(getCookie('a')).toBe('1');
    });

    it('returns null when a similarly-named cookie only partially matches', () => {
        document.cookie = 'foobar=1';
        expect(getCookie('foo')).toBeNull();
    });

    it('returns null and logs when reading throws', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        Object.defineProperty(document, 'cookie', {
            configurable: true,
            get() { throw new Error('boom'); },
        });
        try {
            expect(getCookie('foo')).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[getCookie] Error:'));
        } finally {
            delete (document as unknown as { cookie?: unknown }).cookie;
        }
        document.cookie = 'sanity=1';
        expect(document.cookie).toContain('sanity=1');
    });
});

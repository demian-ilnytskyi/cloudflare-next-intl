import { describe, it, expect, vi } from 'vitest';
import setCookie from './set_cookie';
import getCookie from './get_cookie';

describe('setCookie', () => {
    it('sets a cookie readable back via document.cookie', () => {
        setCookie({ name: 'theme', value: 'dark' });
        expect(getCookie('theme')).toBe('dark');
    });

    it('applies a custom maxAge', () => {
        expect(() => setCookie({ name: 'theme', value: 'light', maxAge: 60 })).not.toThrow();
    });

    it('logs and swallows errors when setting the cookie throws', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
        Object.defineProperty(document, 'cookie', {
            configurable: true,
            set() { throw new Error('boom'); },
        });
        expect(() => setCookie({ name: 'theme', value: 'dark' })).not.toThrow();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Set cookie on client side error'));
        if (originalDescriptor) Object.defineProperty(Document.prototype, 'cookie', originalDescriptor);
    });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import ThemeScript from './theme_script.js';
import { isDarkCookieKey } from './cookie_key.js';

describe('ThemeScript', () => {
    beforeEach(() => {
        document.documentElement.classList.remove('dark');
        document.cookie = `${isDarkCookieKey}=; path=/; max-age=0;`;
    });

    it('renders script#cfni-theme', () => {
        const { container } = render(<ThemeScript />);
        const script = container.querySelector('#cfni-theme');
        expect(script).not.toBeNull();
    });

    it('adds dark class from cookie', () => {
        document.cookie = `${isDarkCookieKey}=true; path=/; max-age=31536000;`;
        const { container } = render(<ThemeScript />);
        const script = container.querySelector('#cfni-theme');
        expect(script).not.toBeNull();
        const code = script?.textContent ?? '';
        new Function(code)();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('falls back to prefers-color-scheme when no cookie', () => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        const { container } = render(<ThemeScript />);
        const script = container.querySelector('#cfni-theme');
        const code = script?.textContent ?? '';
        new Function(code)();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.cookie).toContain(`${isDarkCookieKey}=true`);
    });

    it('removes dark class when cookie is false', () => {
        document.documentElement.classList.add('dark');
        document.cookie = `${isDarkCookieKey}=false; path=/; max-age=31536000;`;
        const { container } = render(<ThemeScript />);
        const script = container.querySelector('#cfni-theme');
        const code = script?.textContent ?? '';
        new Function(code)();
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});

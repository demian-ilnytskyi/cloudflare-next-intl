import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ClientThemeScript from './client_theme_script.js';
import { isDarkCookieKey } from './cookie_key.js';

describe('ClientThemeScript', () => {
    beforeEach(() => {
        document.documentElement.classList.remove('dark');
        document.cookie = `${isDarkCookieKey}=; path=/; max-age=0;`;
    });

    it('renders nothing', () => {
        const { container } = render(<ClientThemeScript />);
        expect(container).toBeEmptyDOMElement();
    });

    it('adds the dark class when the cookie says dark is true', () => {
        document.cookie = `${isDarkCookieKey}=true; path=/; max-age=31536000;`;
        render(<ClientThemeScript />);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('does not toggle the class when it already matches the cookie', () => {
        document.cookie = `${isDarkCookieKey}=false; path=/; max-age=31536000;`;
        document.documentElement.classList.remove('dark');
        render(<ClientThemeScript />);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});

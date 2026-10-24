import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeSwticherButton from './theme_switcher_button.js';

vi.mock('../set_theme_cookie.js', () => ({ default: vi.fn() }));

describe('ThemeSwticherButton', () => {
    beforeEach(() => {
        document.documentElement.classList.remove('dark');
    });

    afterEach(() => {
        cleanup();
    });

    it('renders children and light-mode aria-label by default', () => {
        render(<ThemeSwticherButton lightLabelText="Light" darkLabelText="Dark">icon</ThemeSwticherButton>);
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Dark');
        expect(screen.getByText('icon')).toBeInTheDocument();
    });

    it('toggles the dark class and cookie on click', async () => {
        const setThemeCookie = (await import('../set_theme_cookie.js')).default;
        render(<ThemeSwticherButton lightLabelText="Light" darkLabelText="Dark">icon</ThemeSwticherButton>);
        fireEvent.click(screen.getByRole('button'));
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(setThemeCookie).toHaveBeenCalledWith(true);
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Light');
    });
});

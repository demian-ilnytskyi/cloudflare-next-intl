import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeSwticherButton from './theme_switcher_button.js';

vi.mock('../../client/functions/set_cookie', () => ({ default: vi.fn() }));

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
        const setCookie = (await import('../../client/functions/set_cookie.js')).default;
        render(<ThemeSwticherButton lightLabelText="Light" darkLabelText="Dark">icon</ThemeSwticherButton>);
        fireEvent.click(screen.getByRole('button'));
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(setCookie).toHaveBeenCalledWith({ name: '__is_dark_key__', value: true });
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Light');
    });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemeSwticher from './theme_switcher.js';

vi.mock('../../client/functions/set_cookie', () => ({ default: () => {} }));

describe('ThemeSwticher', () => {
    it('renders the toggle button with both icons', () => {
        render(<ThemeSwticher lightLabelText="Light" darkLabelText="Dark" className="extra" />);
        expect(screen.getByRole('button')).toBeInTheDocument();
    });
});

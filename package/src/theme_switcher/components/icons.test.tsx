import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sun, Moon } from './icons.js';

describe('theme icons', () => {
    it('renders Sun with the given className', () => {
        const { container } = render(<Sun className="sun-class" />);
        expect(container.querySelector('svg')).toHaveClass('sun-class');
    });

    it('renders Moon with the given className', () => {
        const { container } = render(<Moon className="moon-class" />);
        expect(container.querySelector('svg')).toHaveClass('moon-class');
    });
});

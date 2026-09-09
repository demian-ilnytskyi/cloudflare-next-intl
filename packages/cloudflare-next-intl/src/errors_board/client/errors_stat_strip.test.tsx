// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorsStatStrip from './errors_stat_strip.js';

describe('ErrorsStatStrip', () => {
    it('renders Total as new+investigating+resolved, excluding muted', () => {
        render(
            <ErrorsStatStrip
                counts={{ new: 2, investigating: 1, resolved: 3, muted: 10 }}
                activeStatus="all"
                linkFor={(status) => `/errors?status=${status}`}
            />,
        );
        expect(screen.getByText('Total').nextSibling).toHaveTextContent('6');
    });

    it('links each stat via the provided linkFor', () => {
        render(
            <ErrorsStatStrip
                counts={{ new: 1, investigating: 0, resolved: 0, muted: 0 }}
                activeStatus="new"
                linkFor={(status) => `/custom/${status}`}
            />,
        );
        expect(screen.getByText('New').closest('a')).toHaveAttribute('href', '/custom/new');
    });
});

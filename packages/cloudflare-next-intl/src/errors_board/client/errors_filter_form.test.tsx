// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorsFilterForm from './errors_filter_form.js';

describe('ErrorsFilterForm', () => {
    it('renders a flavour option per entry plus "All flavours", and preserves status/flavour as hidden inputs', () => {
        render(<ErrorsFilterForm flavours={['prod', 'staging']} filters={{ flavour: 'prod', status: 'new', q: 'timeout' }} />);
        expect(screen.getByRole('option', { name: 'All flavours' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'prod' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'staging' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Message, caller, or user email')).toHaveValue('timeout');
    });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ErrorsLoginForm from './errors_login_form.js';

describe('ErrorsLoginForm', () => {
    it('calls login with the typed password and onSuccess when it resolves true', async () => {
        const login = vi.fn(async () => true);
        const onSuccess = vi.fn();
        render(<ErrorsLoginForm login={login} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(login).toHaveBeenCalledWith('secret');
    });

    it('shows an error and does not call onSuccess when login resolves false', async () => {
        const login = vi.fn(async () => false);
        const onSuccess = vi.fn();
        render(<ErrorsLoginForm login={login} onSuccess={onSuccess} />);

        fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

        await waitFor(() => expect(screen.getByText('Wrong password')).toBeInTheDocument());
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('renders the default title, or a custom one when given', () => {
        const { rerender } = render(<ErrorsLoginForm login={vi.fn()} onSuccess={vi.fn()} />);
        expect(screen.getByText('Error log')).toBeInTheDocument();

        rerender(<ErrorsLoginForm login={vi.fn()} onSuccess={vi.fn()} title="Admin" />);
        expect(screen.getByText('Admin')).toBeInTheDocument();
    });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorDetailView from './error_detail_view.js';
import type { ErrorRow } from '../server/errors_repository.js';

const row: ErrorRow = {
    id: 42, fingerprint: 'f', created_at: 1000, updated_at: 2000, flavour: 'prod',
    caller: 'MyClass.method', message: 'boom', stack: 'at MyClass.method', params: null,
    is_client: 1, status: 'new', count: 3, user_email: 'user@example.com', reopen_count: 0, resolved_at: null,
};

function makeActions() {
    return {
        loadErrors: vi.fn(async () => ({ rows: [], nextCursor: null })),
        setErrorStatus: vi.fn(async () => undefined),
        deleteErrors: vi.fn(async () => undefined),
        deleteAllResolved: vi.fn(async () => undefined),
    };
}

describe('ErrorDetailView', () => {
    it('renders the caller, message, and stack trace', () => {
        render(<ErrorDetailView row={row} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByRole('heading', { name: 'MyClass.method' })).toBeInTheDocument();
        expect(screen.getAllByText('boom')).toHaveLength(2);
        expect(screen.getByText('at MyClass.method')).toBeInTheDocument();
    });

    it('clicking a status button calls actions.setErrorStatus with this row\'s id', async () => {
        const actions = makeActions();
        render(<ErrorDetailView row={row} actions={actions} onDeleted={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
        await vi.waitFor(() => expect(actions.setErrorStatus).toHaveBeenCalledWith([42], 'resolved'));
    });

    it('deleting calls actions.deleteErrors and onDeleted, after confirmation', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const actions = makeActions();
        const onDeleted = vi.fn();
        render(<ErrorDetailView row={row} actions={actions} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete error' }));
        await vi.waitFor(() => expect(actions.deleteErrors).toHaveBeenCalledWith([42]));
        expect(onDeleted).toHaveBeenCalledTimes(1);
    });

    it('does not delete when the confirmation is cancelled', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const actions = makeActions();
        const onDeleted = vi.fn();
        render(<ErrorDetailView row={row} actions={actions} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete error' }));
        expect(actions.deleteErrors).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
    });

    it('shows "Server" when is_client is 0, hides stack/params, and shows fallback user text', () => {
        const serverRow: ErrorRow = { ...row, is_client: 0, stack: null, params: null, user_email: null };
        render(<ErrorDetailView row={serverRow} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByText('Server')).toBeInTheDocument();
        expect(screen.getByText('Unknown / not signed in')).toBeInTheDocument();
        expect(screen.queryByText('Stack trace')).not.toBeInTheDocument();
        expect(screen.queryByText('Params')).not.toBeInTheDocument();
    });

    it('shows singular regression wording for reopen_count of 1', () => {
        render(<ErrorDetailView row={{ ...row, reopen_count: 1 }} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByText('Came back 1 time after being resolved')).toBeInTheDocument();
    });

    it('shows plural regression wording for reopen_count greater than 1', () => {
        render(<ErrorDetailView row={{ ...row, reopen_count: 2 }} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByText('Came back 2 times after being resolved')).toBeInTheDocument();
    });

    it('shows "Resolved" details when resolved_at is set', () => {
        render(<ErrorDetailView row={{ ...row, resolved_at: 5000 }} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0);
    });

    it('shows request-context fields (path, referrer, user agent) parsed from params', () => {
        const params = JSON.stringify({ requestContext: { path: '/checkout', referer: 'https://ref.example.com', userAgent: 'test-agent' } });
        render(<ErrorDetailView row={{ ...row, params }} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByText('/checkout')).toBeInTheDocument();
        expect(screen.getByText('https://ref.example.com')).toBeInTheDocument();
        expect(screen.getByText('test-agent')).toBeInTheDocument();
        expect(screen.getByText('Params')).toBeInTheDocument();
    });

    it('disables the current status button and keeps others enabled', () => {
        render(<ErrorDetailView row={row} actions={makeActions()} onDeleted={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'New' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Resolved' })).toBeEnabled();
    });
});

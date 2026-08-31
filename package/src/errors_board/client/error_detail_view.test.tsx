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
});

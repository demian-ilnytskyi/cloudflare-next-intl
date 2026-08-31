// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorsListClient from './errors_list_client.js';
import type { ErrorRow } from '../server/errors_repository.js';

const row: ErrorRow = {
	id: 1, fingerprint: 'f', created_at: 1000, updated_at: 2000, flavour: 'prod',
	caller: 'MyClass.method', message: 'boom', stack: null, params: null,
	is_client: 0, status: 'new', count: 1, user_email: null, reopen_count: 0, resolved_at: null,
};

function makeActions() {
	return {
		loadErrors: vi.fn(async () => ({ rows: [], nextCursor: null })),
		setErrorStatus: vi.fn(async () => undefined),
		deleteErrors: vi.fn(async () => undefined),
		deleteAllResolved: vi.fn(async () => undefined),
	};
}

describe('ErrorsListClient', () => {
	it('renders the initial rows and an empty state when there are none', () => {
		render(
			<ErrorsListClient
				initialRows={[]}
				initialNextCursor={null}
				filters={{ flavour: 'all', status: 'all', q: '' }}
				actions={makeActions()}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);
		expect(screen.getByText('No errors here')).toBeInTheDocument();
	});

	it('selecting a row enables the bulk-action buttons and calls setErrorStatus with its id', async () => {
		const actions = makeActions();
		render(
			<ErrorsListClient
				initialRows={[row]}
				initialNextCursor={null}
				filters={{ flavour: 'all', status: 'all', q: '' }}
				actions={actions}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);
		fireEvent.click(screen.getAllByRole('checkbox')[1]); // [0] is "select all"
		fireEvent.click(screen.getByText('Mark resolved'));
		await vi.waitFor(() => expect(actions.setErrorStatus).toHaveBeenCalledWith([1], 'resolved'));
	});
});

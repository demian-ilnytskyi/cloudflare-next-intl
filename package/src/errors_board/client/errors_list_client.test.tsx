// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorsListClient from './errors_list_client.js';
import type { ErrorRow } from '../server/errors_repository.js';

class FakeIntersectionObserver {
	constructor(private callback: IntersectionObserverCallback) {}
	observe(target: Element): void {
		this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
	}
	disconnect(): void {}
	unobserve(): void {}
}

let originalIntersectionObserver: typeof IntersectionObserver | undefined;
beforeAll(() => {
	originalIntersectionObserver = globalThis.IntersectionObserver;
	// @ts-expect-error -- jsdom does not implement IntersectionObserver
	globalThis.IntersectionObserver = FakeIntersectionObserver;
});
afterAll(() => {
	globalThis.IntersectionObserver = originalIntersectionObserver as typeof IntersectionObserver;
});

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

	it('selecting all rows via the header checkbox shows the "N selected" label', () => {
		render(
			<ErrorsListClient
				initialRows={[row, { ...row, id: 2 }]}
				initialNextCursor={null}
				filters={{ flavour: 'all', status: 'all', q: '' }}
				actions={makeActions()}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);
		fireEvent.click(screen.getAllByRole('checkbox')[0]);
		expect(screen.getByText('2 selected')).toBeInTheDocument();
		fireEvent.click(screen.getAllByRole('checkbox')[0]);
		expect(screen.getByText('2 errors')).toBeInTheDocument();
	});

	it('shows "Unmute" instead of "Mute" when filtering by muted status, and calls setErrorStatus("new")', async () => {
		const actions = makeActions();
		render(
			<ErrorsListClient
				initialRows={[row]}
				initialNextCursor={null}
				filters={{ flavour: 'all', status: 'muted', q: '' }}
				actions={actions}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);
		fireEvent.click(screen.getAllByRole('checkbox')[1]);
		fireEvent.click(screen.getByText('Unmute'));
		await vi.waitFor(() => expect(actions.setErrorStatus).toHaveBeenCalledWith([1], 'new'));
	});

	it('bulk delete asks for confirmation, then calls actions.deleteErrors and clears selection', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
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
		fireEvent.click(screen.getAllByRole('checkbox')[1]);
		fireEvent.click(screen.getByText('Delete selected'));
		await vi.waitFor(() => expect(actions.deleteErrors).toHaveBeenCalledWith([1]));
	});

	it('bulk delete does nothing when confirmation is cancelled', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
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
		fireEvent.click(screen.getAllByRole('checkbox')[1]);
		fireEvent.click(screen.getByText('Delete selected'));
		expect(actions.deleteErrors).not.toHaveBeenCalled();
	});

	it('"Delete all resolved" asks for confirmation, then calls actions.deleteAllResolved', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
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
		fireEvent.click(screen.getByText('Delete all resolved'));
		await vi.waitFor(() => expect(actions.deleteAllResolved).toHaveBeenCalledTimes(1));
	});

	it('"Delete all resolved" does nothing when confirmation is cancelled', () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
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
		fireEvent.click(screen.getByText('Delete all resolved'));
		expect(actions.deleteAllResolved).not.toHaveBeenCalled();
	});

	it('shows the "reached the end" message when nextCursor is null and there are rows', () => {
		render(
			<ErrorsListClient
				initialRows={[row]}
				initialNextCursor={null}
				filters={{ flavour: 'all', status: 'all', q: '' }}
				actions={makeActions()}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);
		expect(screen.getByText("You've reached the end.")).toBeInTheDocument();
	});

	it('auto-loads more rows via the intersection observer, showing a loading indicator meanwhile', async () => {
		const actions = makeActions();
		let resolveLoadErrors!: (value: { rows: ErrorRow[]; nextCursor: string | null }) => void;
		actions.loadErrors.mockReturnValue(new Promise((resolve) => { resolveLoadErrors = resolve; }));

		render(
			<ErrorsListClient
				initialRows={[row]}
				initialNextCursor={'100:7'}
				filters={{ flavour: 'all', status: 'all', q: '' }}
				actions={actions}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);

		expect(actions.loadErrors).toHaveBeenCalledWith({ flavour: 'all', status: 'all', q: '', cursor: '100:7' });
		await vi.waitFor(() => expect(screen.getByText('Loading more…')).toBeInTheDocument());

		resolveLoadErrors({ rows: [{ ...row, id: 2 }], nextCursor: null });
		await vi.waitFor(() => expect(screen.getByText("You've reached the end.")).toBeInTheDocument());
	});

	it('unchecking a selected row removes it from the selection', () => {
		render(
			<ErrorsListClient
				initialRows={[row]}
				initialNextCursor={null}
				filters={{ flavour: 'all', status: 'all', q: '' }}
				actions={makeActions()}
				hrefFor={(id) => `/errors/${id}`}
			/>,
		);
		const rowCheckbox = screen.getAllByRole('checkbox')[1];
		fireEvent.click(rowCheckbox);
		expect(screen.getByText('1 selected')).toBeInTheDocument();
		fireEvent.click(rowCheckbox);
		expect(screen.getByText('1 error')).toBeInTheDocument();
	});
});

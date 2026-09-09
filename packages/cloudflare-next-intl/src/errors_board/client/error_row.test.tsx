// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorRowItem from './error_row.js';
import type { ErrorRow } from '../server/errors_repository.js';

const baseRow: ErrorRow = {
	id: 1, fingerprint: 'f', created_at: 1000, updated_at: 2000, flavour: 'prod',
	caller: 'MyClass.method', message: 'boom', stack: null, params: null,
	is_client: 0, status: 'new', count: 1, user_email: null, reopen_count: 0, resolved_at: null,
};

describe('ErrorRowItem', () => {
	it('links via the given hrefFor', () => {
		render(<ErrorRowItem row={baseRow} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/board/${id}`} />);
		expect(screen.getByRole('link')).toHaveAttribute('href', '/board/1');
	});

	it('shows the seen-count badge when count > 1', () => {
		render(<ErrorRowItem row={{ ...baseRow, count: 5 }} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/${id}`} />);
		expect(screen.getByTitle('Seen 5 times')).toBeInTheDocument();
	});

	it('calls onToggleSelect with the row id when the checkbox changes', () => {
		const onToggleSelect = vi.fn();
		render(<ErrorRowItem row={baseRow} selected={false} onToggleSelect={onToggleSelect} hrefFor={(id) => `/${id}`} />);
		fireEvent.click(screen.getByRole('checkbox'));
		expect(onToggleSelect).toHaveBeenCalledWith(1, true);
	});

	it('does not toggle the link navigation when the checkbox is clicked', () => {
		const onToggleSelect = vi.fn();
		render(<ErrorRowItem row={baseRow} selected={false} onToggleSelect={onToggleSelect} hrefFor={(id) => `/${id}`} />);
		const event = fireEvent.click(screen.getByRole('checkbox'));
		expect(event).toBe(true);
	});

	it('shows the client badge when is_client is 1', () => {
		render(<ErrorRowItem row={{ ...baseRow, is_client: 1 }} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/${id}`} />);
		expect(screen.getByText('client')).toBeInTheDocument();
	});

	it('shows the reopen-count badge when reopen_count > 0, with singular wording for 1', () => {
		render(<ErrorRowItem row={{ ...baseRow, reopen_count: 1 }} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/${id}`} />);
		expect(screen.getByTitle('Came back 1 time after being resolved')).toBeInTheDocument();
	});

	it('shows the reopen-count badge with plural wording for more than 1', () => {
		render(<ErrorRowItem row={{ ...baseRow, reopen_count: 3 }} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/${id}`} />);
		expect(screen.getByTitle('Came back 3 times after being resolved')).toBeInTheDocument();
	});

	it('shows the user_email when present', () => {
		render(<ErrorRowItem row={{ ...baseRow, user_email: 'user@example.com' }} selected={false} onToggleSelect={vi.fn()} hrefFor={(id) => `/${id}`} />);
		expect(screen.getByText('user@example.com')).toBeInTheDocument();
	});
});

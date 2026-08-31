'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorRow, ErrorStatus } from '../server/errors_repository.js';
import type { ErrorsActions } from '../server/actions_factory.js';
import ErrorRowItem from './error_row.js';

interface Filters { flavour: string; status: string; q: string }

export default function ErrorsListClient({
	initialRows,
	initialNextCursor,
	filters,
	actions,
	hrefFor,
}: {
	initialRows: ErrorRow[];
	initialNextCursor: string | null;
	filters: Filters;
	actions: ErrorsActions;
	hrefFor: (id: number) => string;
}): Component {
	const [rows, setRows] = useState<ErrorRow[]>(initialRows);
	const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [isPending, setIsPending] = useState(false);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	// Mirrors the latest render's values so `loadMore` (and the
	// IntersectionObserver effect that closes over it) can stay referentially
	// stable across renders instead of tearing the observer down and
	// recreating it every time `isLoadingMore`/`nextCursor`/`filters` change.
	const latestRef = useRef({ isLoadingMore, nextCursor, filters, actions });
	latestRef.current = { isLoadingMore, nextCursor, filters, actions };

	useEffect(() => {
		setRows(initialRows);
		setNextCursor(initialNextCursor);
	}, [initialRows, initialNextCursor]);

	const loadMore = useCallback(() => {
		const { isLoadingMore, nextCursor, filters, actions } = latestRef.current;
		if (isLoadingMore || nextCursor === null) return;
		setIsLoadingMore(true);
		void actions
			.loadErrors({ ...filters, cursor: nextCursor })
			.then((result) => {
				setRows((previous) => [...previous, ...result.rows]);
				setNextCursor(result.nextCursor);
			})
			.finally(() => setIsLoadingMore(false));
	}, []);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{ rootMargin: '400px' },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [loadMore]);

	function toggleSelect(id: number, checked: boolean): void {
		setSelectedIds((previous) => {
			const next = new Set(previous);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	function toggleSelectAll(checked: boolean): void {
		setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
	}

	async function handleBulkStatus(status: ErrorStatus): Promise<void> {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		setIsPending(true);
		try {
			await actions.setErrorStatus(ids, status);
			setSelectedIds(new Set());
		} finally {
			setIsPending(false);
		}
	}

	async function handleBulkDelete(): Promise<void> {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		if (!window.confirm(`Delete ${ids.length} error${ids.length === 1 ? '' : 's'}? This can't be undone.`)) return;
		setIsPending(true);
		try {
			await actions.deleteErrors(ids);
			setSelectedIds(new Set());
		} finally {
			setIsPending(false);
		}
	}

	async function handleDeleteAllResolved(): Promise<void> {
		if (!window.confirm("Delete every resolved error (including ones not currently loaded)? This can't be undone.")) return;
		setIsPending(true);
		try {
			await actions.deleteAllResolved();
		} finally {
			setIsPending(false);
		}
	}

	const hasSelection = selectedIds.size > 0;

	return (
		<div className="flex flex-col gap-3">
			<div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
				<label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
					<input
						type="checkbox"
						checked={rows.length > 0 && selectedIds.size === rows.length}
						onChange={(event) => toggleSelectAll(event.target.checked)}
						className="size-4 accent-blue-600"
					/>
					{hasSelection ? (
						<span className="font-medium text-gray-900 dark:text-white">{selectedIds.size} selected</span>
					) : (
						<span>{rows.length} error{rows.length === 1 ? '' : 's'}</span>
					)}
				</label>
				<div className="ml-auto flex flex-wrap gap-2">
					<button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('investigating')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
						Mark investigating
					</button>
					<button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('resolved')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
						Mark resolved
					</button>
					{filters.status === 'muted' ? (
						<button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('new')} title="Bring these back onto the board as New." className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
							Unmute
						</button>
					) : (
						<button disabled={isPending || !hasSelection} onClick={() => handleBulkStatus('muted')} title="Hide for good. Repeats stay hidden and never reopen." className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
							Mute
						</button>
					)}
					<button disabled={isPending || !hasSelection} onClick={handleBulkDelete} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
						Delete selected
					</button>
					<button disabled={isPending} onClick={handleDeleteAllResolved} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
						Delete all resolved
					</button>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				{rows.map((row) => (
					<ErrorRowItem key={row.id} row={row} selected={selectedIds.has(row.id)} onToggleSelect={toggleSelect} hrefFor={hrefFor} />
				))}
				{rows.length === 0 && (
					<div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
						<p className="text-sm font-medium text-gray-600 dark:text-gray-300">No errors here</p>
						<p className="text-xs text-gray-400 dark:text-gray-500">Nothing matches the current filters.</p>
					</div>
				)}
			</div>

			{nextCursor !== null && (
				<div ref={sentinelRef} className="flex justify-center py-4">
					{isLoadingMore && (
						<span className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
							<span className="size-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent dark:border-gray-600" />
							Loading more…
						</span>
					)}
				</div>
			)}
			{nextCursor === null && rows.length > 0 && (
				<p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">You&apos;ve reached the end.</p>
			)}
		</div>
	);
}

'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import ErrorRowItem from './error_row.js';
export default function ErrorsListClient({ initialRows, initialNextCursor, filters, actions, hrefFor, }) {
    const [rows, setRows] = useState(initialRows);
    const [nextCursor, setNextCursor] = useState(initialNextCursor);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isPending, setIsPending] = useState(false);
    const sentinelRef = useRef(null);
    const latestRef = useRef({ isLoadingMore, nextCursor, filters, actions });
    latestRef.current = { isLoadingMore, nextCursor, filters, actions };
    useEffect(() => {
        setRows(initialRows);
        setNextCursor(initialNextCursor);
    }, [initialRows, initialNextCursor]);
    const loadMore = useCallback(() => {
        const { isLoadingMore, nextCursor, filters, actions } = latestRef.current;
        if (isLoadingMore || nextCursor === null)
            return;
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
        if (!sentinel)
            return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting)
                loadMore();
        }, { rootMargin: '400px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMore]);
    function toggleSelect(id, checked) {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            if (checked)
                next.add(id);
            else
                next.delete(id);
            return next;
        });
    }
    function toggleSelectAll(checked) {
        setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
    }
    async function handleBulkStatus(status) {
        const ids = Array.from(selectedIds);
        setIsPending(true);
        try {
            await actions.setErrorStatus(ids, status);
            setSelectedIds(new Set());
        }
        finally {
            setIsPending(false);
        }
    }
    async function handleBulkDelete() {
        const ids = Array.from(selectedIds);
        if (!window.confirm(`Delete ${ids.length} error${ids.length === 1 ? '' : 's'}? This can't be undone.`))
            return;
        setIsPending(true);
        try {
            await actions.deleteErrors(ids);
            setSelectedIds(new Set());
        }
        finally {
            setIsPending(false);
        }
    }
    async function handleDeleteAllResolved() {
        if (!window.confirm("Delete every resolved error (including ones not currently loaded)? This can't be undone."))
            return;
        setIsPending(true);
        try {
            await actions.deleteAllResolved();
        }
        finally {
            setIsPending(false);
        }
    }
    const hasSelection = selectedIds.size > 0;
    return (_jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("div", { className: "sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90", children: [_jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300", children: [_jsx("input", { type: "checkbox", checked: rows.length > 0 && selectedIds.size === rows.length, onChange: (event) => toggleSelectAll(event.target.checked), className: "size-4 accent-blue-600" }), hasSelection ? (_jsxs("span", { className: "font-medium text-gray-900 dark:text-white", children: [selectedIds.size, " selected"] })) : (_jsxs("span", { children: [rows.length, " error", rows.length === 1 ? '' : 's'] }))] }), _jsxs("div", { className: "ml-auto flex flex-wrap gap-2", children: [_jsx("button", { disabled: isPending || !hasSelection, onClick: () => handleBulkStatus('investigating'), className: "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800", children: "Mark investigating" }), _jsx("button", { disabled: isPending || !hasSelection, onClick: () => handleBulkStatus('resolved'), className: "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800", children: "Mark resolved" }), filters.status === 'muted' ? (_jsx("button", { disabled: isPending || !hasSelection, onClick: () => handleBulkStatus('new'), title: "Bring these back onto the board as New.", className: "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800", children: "Unmute" })) : (_jsx("button", { disabled: isPending || !hasSelection, onClick: () => handleBulkStatus('muted'), title: "Hide for good. Repeats stay hidden and never reopen.", className: "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800", children: "Mute" })), _jsx("button", { disabled: isPending || !hasSelection, onClick: handleBulkDelete, className: "rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950", children: "Delete selected" }), _jsx("button", { disabled: isPending, onClick: handleDeleteAllResolved, className: "rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800", children: "Delete all resolved" })] })] }), _jsxs("div", { className: "flex flex-col gap-2", children: [rows.map((row) => (_jsx(ErrorRowItem, { row: row, selected: selectedIds.has(row.id), onToggleSelect: toggleSelect, hrefFor: hrefFor }, row.id))), rows.length === 0 && (_jsxs("div", { className: "flex flex-col items-center gap-1 rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700", children: [_jsx("p", { className: "text-sm font-medium text-gray-600 dark:text-gray-300", children: "No errors here" }), _jsx("p", { className: "text-xs text-gray-400 dark:text-gray-500", children: "Nothing matches the current filters." })] }))] }), nextCursor !== null && (_jsx("div", { ref: sentinelRef, className: "flex justify-center py-4", children: isLoadingMore && (_jsxs("span", { className: "flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500", children: [_jsx("span", { className: "size-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent dark:border-gray-600" }), "Loading more\u2026"] })) })), nextCursor === null && rows.length > 0 && (_jsx("p", { className: "py-4 text-center text-xs text-gray-400 dark:text-gray-500", children: "You've reached the end." }))] }));
}

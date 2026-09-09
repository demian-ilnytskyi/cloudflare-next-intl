'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { STATUS_BADGE_CLASS, STATUS_LABELS, STATUS_HINTS, formatRelativeTime, formatLocalTimestamp, parseRequestContext, } from '../shared/error_ui_helpers.js';
import { DetailBlock, CopyButton, LocalTime } from './error_ui_client.js';
export default function ErrorDetailView({ row, actions, onDeleted, }) {
    const [isPending, setIsPending] = useState(false);
    async function handleStatusChange(status) {
        setIsPending(true);
        try {
            await actions.setErrorStatus([row.id], status);
        }
        finally {
            setIsPending(false);
        }
    }
    async function handleDelete() {
        if (!window.confirm("Delete this error? This can't be undone."))
            return;
        setIsPending(true);
        try {
            await actions.deleteErrors([row.id]);
            onDeleted();
        }
        finally {
            setIsPending(false);
        }
    }
    const requestContext = parseRequestContext(row.params);
    return (_jsxs("div", { className: "flex flex-col gap-5", style: { opacity: isPending ? 0.5 : 1 }, children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-4", children: [_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: `rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[row.status]}`, children: row.status }), _jsx("span", { className: "rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300", children: row.flavour }), _jsx("span", { className: "rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300", children: row.is_client === 1 ? 'Client' : 'Server' }), row.count > 1 && (_jsxs("span", { className: "rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400", children: ["Seen \u00D7", row.count] })), _jsx(CopyButton, { text: typeof window !== 'undefined' ? window.location.href : String(row.id), label: "Copy link", copiedLabel: "Link copied" })] }), _jsx("h1", { className: "font-mono text-lg font-semibold wrap-break-word text-gray-900 dark:text-white", children: row.caller }), _jsx("p", { className: "text-sm text-gray-600 dark:text-gray-300", children: row.message })] }), _jsxs("div", { className: "flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end", children: [_jsxs("div", { className: "flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center", children: [_jsx("div", { className: "flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700", children: Object.keys(STATUS_LABELS).map((status, index) => (_jsx("button", { disabled: isPending || row.status === status, onClick: () => handleStatusChange(status), className: `flex-1 px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default sm:flex-none ${index > 0 ? 'border-l border-gray-300 dark:border-gray-700' : ''} ${row.status === status
                                                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`, children: STATUS_LABELS[status] }, status))) }), _jsx("button", { disabled: isPending, onClick: handleDelete, className: "rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950", children: "Delete error" })] }), _jsx("p", { className: "max-w-72 text-[11px] leading-snug text-gray-400 sm:text-right dark:text-gray-500", children: STATUS_HINTS[row.status] })] })] }), _jsxs("dl", { className: "grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs sm:grid-cols-3 dark:border-gray-800 dark:bg-gray-900/60", children: [_jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "First seen" }), _jsx("dd", { className: "text-gray-700 dark:text-gray-300", children: _jsx(LocalTime, { format: formatLocalTimestamp, timestampMs: row.created_at }) })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "Last seen" }), _jsxs("dd", { className: "text-gray-700 dark:text-gray-300", children: [_jsx(LocalTime, { format: formatLocalTimestamp, timestampMs: row.updated_at }), ' ', _jsxs("span", { className: "text-gray-400 dark:text-gray-500", children: ["(", _jsx(LocalTime, { format: formatRelativeTime, timestampMs: row.updated_at }), ")"] })] })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "User" }), _jsx("dd", { className: "text-gray-700 dark:text-gray-300", children: row.user_email ?? 'Unknown / not signed in' })] }), _jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "Regressions" }), _jsx("dd", { className: "text-gray-700 dark:text-gray-300", children: row.reopen_count > 0
                                    ? `Came back ${row.reopen_count} time${row.reopen_count === 1 ? '' : 's'} after being resolved`
                                    : 'Never came back after a fix' })] }), row.resolved_at !== null && (_jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "Resolved" }), _jsx("dd", { className: "text-gray-700 dark:text-gray-300", children: _jsx(LocalTime, { format: formatRelativeTime, timestampMs: row.resolved_at }) })] })), requestContext?.path && (_jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "Page" }), _jsx("dd", { className: "break-all text-gray-700 dark:text-gray-300", children: requestContext.path })] })), requestContext?.referer && (_jsxs("div", { children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "Referrer" }), _jsx("dd", { className: "break-all text-gray-700 dark:text-gray-300", children: requestContext.referer })] })), requestContext?.userAgent && (_jsxs("div", { className: "col-span-2 sm:col-span-3", children: [_jsx("dt", { className: "text-gray-400 dark:text-gray-500", children: "User agent" }), _jsx("dd", { className: "break-all text-gray-700 dark:text-gray-300", children: requestContext.userAgent })] }))] }), _jsx(DetailBlock, { label: "Message", text: row.message }), row.stack && _jsx(DetailBlock, { label: "Stack trace", text: row.stack }), row.params && _jsx(DetailBlock, { label: "Params", text: row.params })] }));
}

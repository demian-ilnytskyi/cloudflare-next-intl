import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Link from 'next/link.js';
const STAT_CONFIG = [
    { status: 'all', label: 'Total', dotClass: 'bg-blue-500' },
    { status: 'new', label: 'New', dotClass: 'bg-red-500' },
    { status: 'investigating', label: 'Investigating', dotClass: 'bg-amber-500' },
    { status: 'resolved', label: 'Resolved', dotClass: 'bg-emerald-500' },
    { status: 'muted', label: 'Muted', dotClass: 'bg-gray-400 dark:bg-gray-500' },
];
export default function ErrorsStatStrip({ counts, activeStatus, linkFor, }) {
    const total = counts.new + counts.investigating + counts.resolved;
    return (_jsx("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5", children: STAT_CONFIG.map(({ status, label, dotClass }) => {
            const value = status === 'all' ? total : counts[status];
            const isActive = activeStatus === status;
            return (_jsxs(Link, { prefetch: false, href: linkFor(status), className: `flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${isActive
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10'
                    : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/50'}`, children: [_jsxs("span", { className: "flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400", children: [_jsx("span", { className: `size-2 rounded-full ${dotClass}`, "aria-hidden": true }), label] }), _jsx("span", { className: "text-lg font-semibold tabular-nums text-gray-900 dark:text-white", children: value })] }, status));
        }) }));
}

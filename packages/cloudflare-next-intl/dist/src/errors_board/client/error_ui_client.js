'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export function useMounted() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}
export function LocalTime({ format, timestampMs }) {
    const mounted = useMounted();
    return _jsx("span", { suppressHydrationWarning: true, children: mounted ? format(timestampMs) : '' });
}
export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied', }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied)
            return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);
    function handleCopy(event) {
        event.preventDefault();
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
        });
    }
    return (_jsx("button", { type: "button", onClick: handleCopy, className: "rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200", children: copied ? copiedLabel : label }));
}
export function DetailBlock({ label, text }) {
    return (_jsxs("div", { className: "overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-950/60", children: [_jsx("span", { className: "text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500", children: label }), _jsx(CopyButton, { text: text })] }), _jsx("pre", { className: "max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-gray-700 dark:bg-gray-950 dark:text-gray-300", children: text })] }));
}

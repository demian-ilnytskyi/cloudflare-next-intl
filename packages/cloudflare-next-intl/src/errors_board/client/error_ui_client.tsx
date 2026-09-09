'use client';

import { useEffect, useState } from 'react';

/** These pages typically SSR fresh on every request while the server clock and the browser's differ — reading the browser zone during render would mismatch on hydration, so defer it until after mount. */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}

/** Renders a browser-zone-dependent time string, blank until hydrated. */
export function LocalTime({ format, timestampMs }: {
    format: (timestampMs: number) => string;
    timestampMs: number;
}): Component {
    const mounted = useMounted();
    return <span suppressHydrationWarning>{mounted ? format(timestampMs) : ''}</span>;
}

export function CopyButton({
    text,
    label = 'Copy',
    copiedLabel = 'Copied',
}: {
    text: string;
    label?: string;
    copiedLabel?: string;
}): Component {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    function handleCopy(event: React.MouseEvent): void {
        event.preventDefault();
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
        });
    }

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
            {copied ? copiedLabel : label}
        </button>
    );
}

export function DetailBlock({ label, text }: { label: string; text: string }): Component {
    return (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-950/60">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
                <CopyButton text={text} />
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-gray-700 dark:bg-gray-950 dark:text-gray-300">
                {text}
            </pre>
        </div>
    );
}

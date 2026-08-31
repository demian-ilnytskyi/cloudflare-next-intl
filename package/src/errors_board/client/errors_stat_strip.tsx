import Link from 'next/link.js';
import type { ErrorStatus } from '../server/errors_repository.js';

const STAT_CONFIG: { status: ErrorStatus | 'all'; label: string; dotClass: string }[] = [
    { status: 'all', label: 'Total', dotClass: 'bg-blue-500' },
    { status: 'new', label: 'New', dotClass: 'bg-red-500' },
    { status: 'investigating', label: 'Investigating', dotClass: 'bg-amber-500' },
    { status: 'resolved', label: 'Resolved', dotClass: 'bg-emerald-500' },
    { status: 'muted', label: 'Muted', dotClass: 'bg-gray-400 dark:bg-gray-500' },
];

/** `linkFor` builds the href for a given status filter — pass it rather than hardcoding `/errors`, so this mounts at whatever route your app puts the board on. */
export default function ErrorsStatStrip({
    counts,
    activeStatus,
    linkFor,
}: {
    counts: Record<ErrorStatus, number>;
    activeStatus: string;
    linkFor: (status: string) => string;
}): Component {
    // Muted is excluded from Total on purpose — it's the "stop showing me this" bucket.
    const total = counts.new + counts.investigating + counts.resolved;

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {STAT_CONFIG.map(({ status, label, dotClass }) => {
                const value = status === 'all' ? total : counts[status];
                const isActive = activeStatus === status;
                return (
                    <Link
                        prefetch={false}
                        key={status}
                        href={linkFor(status)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${
                            isActive
                                ? 'border-blue-400 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10'
                                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/50'
                        }`}
                    >
                        <span className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                            <span className={`size-2 rounded-full ${dotClass}`} aria-hidden />
                            {label}
                        </span>
                        <span className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">{value}</span>
                    </Link>
                );
            })}
        </div>
    );
}

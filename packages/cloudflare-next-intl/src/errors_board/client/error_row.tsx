'use client';

import type { ErrorRow } from '../server/errors_repository.js';
import { STATUS_BADGE_CLASS, STATUS_DOT_CLASS, formatRelativeTime, formatLocalTimestamp } from '../shared/error_ui_helpers.js';
import { LocalTime, useMounted } from './error_ui_client.js';

export default function ErrorRowItem({
	row,
	selected,
	onToggleSelect,
	hrefFor,
}: {
	row: ErrorRow;
	selected: boolean;
	onToggleSelect: (id: number, checked: boolean) => void;
	hrefFor: (id: number) => string;
}): Component {
	const mounted = useMounted();
	const absoluteTime = mounted ? formatLocalTimestamp(row.updated_at) : undefined;

	return (
		<a
			href={hrefFor(row.id)}
			className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/50"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className={`size-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[row.status]}`} aria-hidden />
				<input
					type="checkbox"
					checked={selected}
					onClick={(event) => event.stopPropagation()}
					onChange={(event) => onToggleSelect(row.id, event.target.checked)}
					className="size-4 shrink-0 accent-blue-600"
				/>
				<span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_BADGE_CLASS[row.status]}`}>
					{row.status}
				</span>
				<span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
					{row.flavour}
				</span>
				{row.is_client === 1 && (
					<span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
						client
					</span>
				)}
				{row.count > 1 && (
					<span
						className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400"
						title={`Seen ${row.count} times`}
					>
						×{row.count}
					</span>
				)}
				{row.reopen_count > 0 && (
					<span
						className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
						title={`Came back ${row.reopen_count} time${row.reopen_count === 1 ? '' : 's'} after being resolved`}
					>
						↩ {row.reopen_count}
					</span>
				)}
				<span className="ml-auto shrink-0 text-xs text-gray-400 dark:text-gray-500" title={absoluteTime}>
					<LocalTime format={formatRelativeTime} timestampMs={row.updated_at} />
				</span>
			</div>
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pl-4 sm:flex-nowrap">
				<span className="shrink-0 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100">{row.caller}</span>
				<span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-400">{row.message}</span>
				{row.user_email && (
					<span className="shrink-0 truncate text-xs text-gray-400 sm:ml-auto sm:max-w-[40%] dark:text-gray-500">
						{row.user_email}
					</span>
				)}
			</div>
		</a>
	);
}

import type { ErrorStatus } from '../server/errors_repository.js';

export const STATUS_LABELS: Record<ErrorStatus, string> = {
    new: 'New',
    investigating: 'Investigating',
    resolved: 'Resolved',
    muted: 'Muted',
};

/** One-line explanation of what each status DOES when the error fires again. */
export const STATUS_HINTS: Record<ErrorStatus, string> = {
    new: 'Needs triage.',
    investigating: 'Being worked on. Repeats keep this status.',
    resolved: 'Fixed. If it happens again it reopens as New.',
    muted: 'Ignored for good. Repeats stay hidden and never change status.',
};

export const STATUS_DOT_CLASS: Record<ErrorStatus, string> = {
    new: 'bg-red-500',
    investigating: 'bg-amber-500',
    resolved: 'bg-emerald-500',
    muted: 'bg-gray-400 dark:bg-gray-500',
};

export const STATUS_BADGE_CLASS: Record<ErrorStatus, string> = {
    new: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
    investigating: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    muted: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700',
};

export function formatRelativeTime(timestampMs: number): string {
    const diffSeconds = Math.round((timestampMs - Date.now()) / 1000);
    const absSeconds = Math.abs(diffSeconds);

    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];

    for (const [unit, secondsInUnit] of units) {
        if (absSeconds >= secondsInUnit) {
            const value = Math.round(diffSeconds / secondsInUnit);
            return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(value, unit);
        }
    }
    return 'just now';
}

/** Native `Intl` instead of `luxon` (this package has no date-library dependency to spend on one formatter) — a locale-formatted date-time string in the *caller's* timezone (the browser's zone, when called from a client component). */
export function formatLocalTimestamp(timestampMs: number): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(timestampMs));
}

export interface ParsedRequestContext {
    path?: string;
    userAgent?: string;
    referer?: string;
}

/** `params` is the raw JSON stored on the row — `createErrorsActions`'s callers typically write `requestContext: { path, userAgent, referer }` alongside their own params for a client-originated error (see the README); server errors won't have it. */
export function parseRequestContext(paramsJson: string | null): ParsedRequestContext | null {
    if (!paramsJson) return null;
    try {
        const parsed = JSON.parse(paramsJson) as { requestContext?: ParsedRequestContext };
        return parsed.requestContext ?? null;
    } catch {
        return null;
    }
}

/**
 * The message-extraction half of `isStaleDeployError` and
 * `use_stale_deploy_recovery.ts`'s own private reload-skip check — pulled
 * out so both share one reading of "what does this error's message
 * actually say", instead of two copies that could drift.
 *
 * Lowercased, and `null` (not `''`) for anything that isn't an `Error` or a
 * `string` — a `null` means "no message to match against", which a caller
 * must treat as "does not match" rather than accidentally matching every
 * pattern against an empty string.
 */
export function extractLowercaseMessage(error: unknown): string | null {
    if (error instanceof Error) return (error.message || '').toLowerCase();
    if (typeof error === 'string') return error.toLowerCase();
    return null;
}

/** Whether `message` contains any of `patterns` as a substring. `patterns`
 *  is matched case-insensitively regardless of the case it was written in —
 *  callers pass their own already-lowercased list when checking many
 *  messages against the same patterns repeatedly (avoids re-lowercasing the
 *  pattern list on every call), or a mixed-case list for a one-off check. */
export function messageMatchesAnyPattern(message: string, patterns: readonly string[]): boolean {
    return patterns.some((pattern) => message.includes(pattern.toLowerCase()));
}

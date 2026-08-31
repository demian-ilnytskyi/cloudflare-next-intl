export const ERROR_STATUSES = ['new', 'investigating', 'resolved', 'muted'] as const;
export type ErrorStatus = typeof ERROR_STATUSES[number];

/** Statuses shown on the board by default — `muted` is opt-in only (see errors_board README). */
export const BOARD_STATUSES = ['new', 'investigating', 'resolved'] as const;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
const MAX_PARAMS_LENGTH = 4000;
export const ERRORS_PAGE_SIZE = 50;
export const MAX_IDS_PER_ACTION = 200;

export interface ErrorRow {
    id: number;
    fingerprint: string;
    created_at: number;
    updated_at: number;
    flavour: string;
    caller: string;
    message: string;
    stack: string | null;
    params: string | null;
    is_client: number;
    status: ErrorStatus;
    count: number;
    user_email: string | null;
    reopen_count: number;
    resolved_at: number | null;
}

/** No `@cloudflare/workers-types` dependency — duck-typed against D1's real shape. */
export interface D1PreparedStatementLike {
    bind(...values: unknown[]): D1PreparedStatementLike;
    run(): Promise<unknown>;
    all<T = unknown>(): Promise<{ results?: T[] }>;
    first<T = unknown>(): Promise<T | null>;
}
export interface D1DatabaseLike {
    prepare(sql: string): D1PreparedStatementLike;
    batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<{ results?: T[] }[]>;
}

export interface RecordErrorInput {
    flavour: string;
    caller: string;
    message: string;
    stack: string | null;
    params: string | null;
    isClient: boolean;
    userEmail: string | null;
}

export interface ErrorsListFilters {
    flavour: string;
    status: ErrorStatus | 'all';
    q: string;
    cursor: number | null;
}

export interface ErrorsListResult {
    rows: ErrorRow[];
    nextCursor: number | null;
}

export interface ErrorsBoardResult extends ErrorsListResult {
    flavours: string[];
    counts: Record<ErrorStatus, number>;
}

export function isErrorStatus(value: string): value is ErrorStatus {
    return (ERROR_STATUSES as readonly string[]).includes(value);
}

/** Never throws — every field falls back to a safe default instead of rejecting a malformed caller-supplied param bag. */
export function parseErrorsListFilters(raw: {
    flavour?: string;
    status?: string;
    q?: string;
    cursor?: number | string | null;
}): ErrorsListFilters {
    const status = raw.status === 'all' || (raw.status && isErrorStatus(raw.status)) ? (raw.status as ErrorStatus | 'all') : 'all';
    const cursorNumber = raw.cursor === null || raw.cursor === undefined ? null : Number(raw.cursor);
    const cursor = cursorNumber !== null && Number.isInteger(cursorNumber) && cursorNumber >= 0 ? cursorNumber : null;
    return {
        flavour: raw.flavour ?? 'all',
        status,
        q: (raw.q ?? '').slice(0, 200),
        cursor,
    };
}

/** Throws on an empty or invalid list — callers are server actions guarded by an access gate, so a bad id list is a bug, not user input to degrade gracefully for. */
export function boundErrorIds(ids: number[]): number[] {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('errors_board: id list must not be empty');
    if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new Error('errors_board: every id must be a positive integer');
    }
    return ids.slice(0, MAX_IDS_PER_ACTION);
}

function truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export { MAX_MESSAGE_LENGTH, MAX_STACK_LENGTH, MAX_PARAMS_LENGTH, truncate };

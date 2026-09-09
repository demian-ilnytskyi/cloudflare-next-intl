export declare const ERROR_STATUSES: readonly ["new", "investigating", "resolved", "muted"];
export type ErrorStatus = typeof ERROR_STATUSES[number];
export declare const BOARD_STATUSES: readonly ["new", "investigating", "resolved"];
declare const MAX_MESSAGE_LENGTH = 2000;
declare const MAX_STACK_LENGTH = 8000;
declare const MAX_PARAMS_LENGTH = 4000;
export declare const ERRORS_PAGE_SIZE = 50;
export declare const MAX_IDS_PER_ACTION = 200;
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
export interface D1PreparedStatementLike {
    bind(...values: unknown[]): D1PreparedStatementLike;
    run(): Promise<unknown>;
    all<T = unknown>(): Promise<{
        results?: T[];
    }>;
    first<T = unknown>(): Promise<T | null>;
}
export interface D1DatabaseLike {
    prepare(sql: string): D1PreparedStatementLike;
    batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<{
        results?: T[];
    }[]>;
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
    cursor: string | null;
}
export interface ErrorsListResult {
    rows: ErrorRow[];
    nextCursor: string | null;
}
export interface ErrorsBoardResult extends ErrorsListResult {
    flavours: string[];
    counts: Record<ErrorStatus, number>;
}
export declare function isErrorStatus(value: string): value is ErrorStatus;
export declare function encodeCursor(updatedAt: number, id: number): string;
export declare function parseErrorsListFilters(raw: {
    flavour?: string;
    status?: string;
    q?: string;
    cursor?: string | null;
}): ErrorsListFilters;
export declare function boundErrorIds(ids: number[]): number[];
declare function truncate(value: string, maxLength: number): string;
export { MAX_MESSAGE_LENGTH, MAX_STACK_LENGTH, MAX_PARAMS_LENGTH, truncate };
export declare function ensureSchema(db: D1DatabaseLike): Promise<void>;
export declare function computeFingerprint(flavour: string, caller: string, message: string): Promise<string>;
export declare function recordError(db: D1DatabaseLike, input: RecordErrorInput): Promise<void>;
export declare function listErrors(db: D1DatabaseLike, filters: ErrorsListFilters): Promise<ErrorsListResult>;
export declare function getErrorById(db: D1DatabaseLike, id: number): Promise<ErrorRow | null>;
export declare function distinctFlavours(db: D1DatabaseLike): Promise<string[]>;
export declare function loadErrorsBoard(db: D1DatabaseLike, filters: ErrorsListFilters): Promise<ErrorsBoardResult>;
export declare function setErrorsStatus(db: D1DatabaseLike, ids: number[], status: ErrorStatus): Promise<void>;
export declare function deleteErrorsByIds(db: D1DatabaseLike, ids: number[]): Promise<void>;
export declare function deleteAllResolvedErrors(db: D1DatabaseLike): Promise<void>;

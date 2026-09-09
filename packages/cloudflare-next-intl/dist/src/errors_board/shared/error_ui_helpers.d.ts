import type { ErrorStatus } from '../server/errors_repository.js';
export declare const STATUS_LABELS: Record<ErrorStatus, string>;
export declare const STATUS_HINTS: Record<ErrorStatus, string>;
export declare const STATUS_DOT_CLASS: Record<ErrorStatus, string>;
export declare const STATUS_BADGE_CLASS: Record<ErrorStatus, string>;
export declare function formatRelativeTime(timestampMs: number): string;
export declare function formatLocalTimestamp(timestampMs: number): string;
export interface ParsedRequestContext {
    path?: string;
    userAgent?: string;
    referer?: string;
}
export declare function parseRequestContext(paramsJson: string | null): ParsedRequestContext | null;

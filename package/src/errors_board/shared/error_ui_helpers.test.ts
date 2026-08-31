import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, formatLocalTimestamp, parseRequestContext, STATUS_LABELS } from './error_ui_helpers.js';

describe('formatRelativeTime', () => {
    afterEach(() => vi.useRealTimers());

    it('renders a past timestamp as "X ago"', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
        expect(formatRelativeTime(new Date('2026-01-01T00:00:00Z').getTime())).toBe('10 minutes ago');
    });

    it('renders "just now" for anything under a minute', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
        expect(formatRelativeTime(new Date('2026-01-01T00:00:00Z').getTime())).toBe('just now');
    });
});

describe('formatLocalTimestamp', () => {
    it('formats a UTC-ms timestamp as a locale date-time string', () => {
        const formatted = formatLocalTimestamp(Date.UTC(2026, 0, 1, 12, 30));
        expect(typeof formatted).toBe('string');
        expect(formatted.length).toBeGreaterThan(0);
    });
});

describe('parseRequestContext', () => {
    it('returns null for null input', () => {
        expect(parseRequestContext(null)).toBeNull();
    });
    it('returns null for unparseable JSON', () => {
        expect(parseRequestContext('not json')).toBeNull();
    });
    it('returns null when there is no requestContext key', () => {
        expect(parseRequestContext(JSON.stringify({ other: 1 }))).toBeNull();
    });
    it('extracts requestContext when present', () => {
        const parsed = parseRequestContext(JSON.stringify({ requestContext: { path: '/a', userAgent: 'ua', referer: 'r' } }));
        expect(parsed).toEqual({ path: '/a', userAgent: 'ua', referer: 'r' });
    });
});

describe('STATUS_LABELS', () => {
    it('has an entry for every status', () => {
        expect(Object.keys(STATUS_LABELS).sort()).toEqual(['investigating', 'muted', 'new', 'resolved']);
    });
});

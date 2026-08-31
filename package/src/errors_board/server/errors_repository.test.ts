import { describe, it, expect } from 'vitest';
import { isErrorStatus, parseErrorsListFilters, boundErrorIds, ERROR_STATUSES } from './errors_repository.js';

describe('isErrorStatus', () => {
    it('accepts every known status', () => {
        for (const status of ERROR_STATUSES) expect(isErrorStatus(status)).toBe(true);
    });
    it('rejects an unknown string', () => {
        expect(isErrorStatus('archived')).toBe(false);
    });
});

describe('parseErrorsListFilters', () => {
    it('defaults flavour to "all", status to "all", q to "", cursor to null', () => {
        expect(parseErrorsListFilters({})).toEqual({ flavour: 'all', status: 'all', q: '', cursor: null });
    });
    it('passes through valid values', () => {
        expect(parseErrorsListFilters({ flavour: 'prod', status: 'new', q: 'timeout', cursor: 123 }))
            .toEqual({ flavour: 'prod', status: 'new', q: 'timeout', cursor: 123 });
    });
    it('falls back to "all" for an invalid status rather than throwing', () => {
        expect(parseErrorsListFilters({ status: 'bogus' }).status).toBe('all');
    });
    it('coerces a string cursor to a number', () => {
        expect(parseErrorsListFilters({ cursor: '456' }).cursor).toBe(456);
    });
    it('rejects a negative cursor back to null', () => {
        expect(parseErrorsListFilters({ cursor: -1 }).cursor).toBeNull();
    });
});

describe('boundErrorIds', () => {
    it('throws on an empty array', () => {
        expect(() => boundErrorIds([])).toThrow();
    });
    it('throws on a non-positive-integer id', () => {
        expect(() => boundErrorIds([1, -2])).toThrow();
        expect(() => boundErrorIds([1.5])).toThrow();
    });
    it('caps at 200 ids', () => {
        const ids = Array.from({ length: 250 }, (_, i) => i + 1);
        expect(boundErrorIds(ids)).toHaveLength(200);
    });
    it('passes through a valid, small list unchanged', () => {
        expect(boundErrorIds([1, 2, 3])).toEqual([1, 2, 3]);
    });
});

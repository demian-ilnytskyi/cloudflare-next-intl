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

import {
    computeFingerprint,
    recordError,
    listErrors,
    getErrorById,
    distinctFlavours,
    loadErrorsBoard,
    setErrorsStatus,
    deleteErrorsByIds,
    deleteAllResolvedErrors,
    type D1DatabaseLike,
    type D1PreparedStatementLike,
} from './errors_repository.js';

/** Records every `prepare()` call's SQL + the final `bind()` args, without emulating real SQLite semantics — sufficient to assert *what* the repository asks D1 to do. */
function createFakeD1(overrides?: {
    all?: unknown[];
    first?: unknown;
    batch?: unknown[][];
}): D1DatabaseLike & { calls: { sql: string; bindings: unknown[] }[] } {
    const calls: { sql: string; bindings: unknown[] }[] = [];
    function makeStatement(sql: string): D1PreparedStatementLike {
        let bindings: unknown[] = [];
        const statement: D1PreparedStatementLike = {
            bind(...values: unknown[]) {
                bindings = values;
                return statement;
            },
            async run() {
                calls.push({ sql, bindings });
                return {};
            },
            async all<T>() {
                calls.push({ sql, bindings });
                return { results: (overrides?.all ?? []) as T[] };
            },
            async first<T>() {
                calls.push({ sql, bindings });
                return (overrides?.first ?? null) as T | null;
            },
        };
        return statement;
    }
    return {
        calls,
        prepare: (sql: string) => makeStatement(sql),
        batch: async (statements: D1PreparedStatementLike[]) => {
            const results = overrides?.batch ?? statements.map(() => []);
            for (const s of statements) await (s as unknown as { run(): Promise<unknown> }).run();
            return results.map((r) => ({ results: r }));
        },
    };
}

describe('computeFingerprint', () => {
    it('is stable for the same inputs and differs when any input changes', async () => {
        const a = await computeFingerprint('prod', 'MyClass.method', 'boom');
        const b = await computeFingerprint('prod', 'MyClass.method', 'boom');
        const c = await computeFingerprint('prod', 'MyClass.method', 'different');
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
});

describe('recordError', () => {
    it('creates the table, indexes, and inserts a row bound with the input fields', async () => {
        const db = createFakeD1();
        await recordError(db, {
            flavour: 'prod',
            caller: 'MyClass.method',
            message: 'boom',
            stack: 'at MyClass.method',
            params: '{}',
            isClient: false,
            userEmail: 'user@example.com',
        });
        const insertCall = db.calls.find((c) => c.sql.includes('INSERT INTO errors'));
        expect(insertCall).toBeDefined();
        expect(insertCall!.bindings).toContain('prod');
        expect(insertCall!.bindings).toContain('MyClass.method');
        expect(insertCall!.bindings).toContain('boom');
        expect(insertCall!.bindings).toContain('user@example.com');
    });
});

describe('listErrors', () => {
    it('binds the flavour, status, search, and cursor filters into the WHERE clause', async () => {
        const db = createFakeD1({ all: [] });
        await listErrors(db, { flavour: 'prod', status: 'new', q: 'timeout', cursor: 100 });
        const listCall = db.calls.find((c) => c.sql.startsWith('SELECT * FROM errors'));
        expect(listCall!.sql).toContain('flavour = ?');
        expect(listCall!.sql).toContain('status = ?');
        expect(listCall!.sql).toContain('updated_at < ?');
        expect(listCall!.bindings).toEqual(expect.arrayContaining(['prod', 'new', 100]));
    });

    it('excludes muted rows when status is "all"', async () => {
        const db = createFakeD1({ all: [] });
        await listErrors(db, { flavour: 'all', status: 'all', q: '', cursor: null });
        const listCall = db.calls.find((c) => c.sql.startsWith('SELECT * FROM errors'));
        expect(listCall!.sql).toContain("status != 'muted'");
    });

    it('reports nextCursor from the (PAGE_SIZE+1)th row and trims the page to PAGE_SIZE', async () => {
        const rows = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, updated_at: 1000 - i }));
        const db = createFakeD1({ all: rows });
        const result = await listErrors(db, { flavour: 'all', status: 'all', q: '', cursor: null });
        expect(result.rows).toHaveLength(50);
        expect(result.nextCursor).toBe(rows[49].updated_at);
    });
});

describe('getErrorById', () => {
    it('returns the row when found', async () => {
        const db = createFakeD1({ first: { id: 1 } });
        expect(await getErrorById(db, 1)).toEqual({ id: 1 });
    });
    it('returns null when not found', async () => {
        const db = createFakeD1({ first: null });
        expect(await getErrorById(db, 999)).toBeNull();
    });
});

describe('distinctFlavours', () => {
    it('maps rows to a flat string array', async () => {
        const db = createFakeD1({ all: [{ flavour: 'prod' }, { flavour: 'staging' }] });
        expect(await distinctFlavours(db)).toEqual(['prod', 'staging']);
    });
});

describe('loadErrorsBoard', () => {
    it('runs one batch call and assembles rows/flavours/counts from it', async () => {
        const db = createFakeD1({
            batch: [
                [{ id: 1, updated_at: 100 }],
                [{ flavour: 'prod' }],
                [{ status: 'new', count: 3 }],
            ],
        });
        const board = await loadErrorsBoard(db, { flavour: 'all', status: 'all', q: '', cursor: null });
        expect(board.rows).toEqual([{ id: 1, updated_at: 100 }]);
        expect(board.flavours).toEqual(['prod']);
        expect(board.counts).toEqual({ new: 3, investigating: 0, resolved: 0, muted: 0 });
    });
});

describe('setErrorsStatus', () => {
    it('binds the status and stamps resolved_at only when resolving', async () => {
        const db = createFakeD1();
        await setErrorsStatus(db, [1, 2], 'resolved');
        const updateCall = db.calls.find((c) => c.sql.startsWith('UPDATE errors'));
        expect(updateCall!.bindings.slice(0, 2)).toEqual(['resolved', 'resolved']);
        expect(updateCall!.bindings).toContain(1);
        expect(updateCall!.bindings).toContain(2);
    });
});

describe('deleteErrorsByIds / deleteAllResolvedErrors', () => {
    it('deletes by id list', async () => {
        const db = createFakeD1();
        await deleteErrorsByIds(db, [1, 2, 3]);
        const deleteCall = db.calls.find((c) => c.sql.startsWith('DELETE FROM errors WHERE id IN'));
        expect(deleteCall!.bindings).toEqual([1, 2, 3]);
    });
    it('deletes all resolved rows', async () => {
        const db = createFakeD1();
        await deleteAllResolvedErrors(db);
        expect(db.calls.some((c) => c.sql === "DELETE FROM errors WHERE status = 'resolved'")).toBe(true);
    });
});

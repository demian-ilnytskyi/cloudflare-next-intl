import { describe, expect, it, vi } from 'vitest';
import executeRest from './rest_execute.js';
import type { RestClient } from './rest_client.js';
import UnsupportedSqlError from './unsupported_sql.js';

function stubClient(result: { data: unknown; error?: { message: string; code?: string } | null; count?: number | null }) {
    const calls: { method: string; args: unknown[] }[] = [];
    const builder: Record<string, unknown> = {};
    const proxy = new Proxy(builder, {
        get(_target, method: string) {
            if (method === 'then') {
                return (onfulfilled: (value: unknown) => unknown) =>
                    Promise.resolve(onfulfilled({ data: result.data, error: result.error ?? null, count: result.count ?? null }));
            }
            return (...args: unknown[]) => {
                calls.push({ method, args });
                return proxy;
            };
        },
    });
    const from = vi.fn(() => proxy);
    return { calls, from, client: { from, rpc: vi.fn() } as unknown as RestClient };
}

describe('executeRest', () => {
    it('runs a select and returns positional rows in projection order', async () => {
        const { client, calls, from } = stubClient({ data: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] });
        const result = await executeRest(
            client,
            {
                kind: 'select',
                table: 'users',
                projection: [{ column: 'id' }, { column: 'name', alias: 'userName' }],
                where: { kind: 'compare', column: 'id', operator: 'gt', value: { kind: 'param', index: 1 } },
                orderBy: [{ column: 'name', ascending: false, nullsFirst: true }],
                limit: { kind: 'literal', value: 10 },
                offset: { kind: 'literal', value: 5 },
            },
            [0],
        );
        expect(from).toHaveBeenCalledWith('users');
        expect(calls.map((call) => call.method)).toEqual(['select', 'gt', 'order', 'range']);
        expect(calls[0]!.args[0]).toBe('id,userName:name');
        expect(calls[2]!.args).toEqual(['name', { ascending: false, nullsFirst: true }]);
        expect(calls[3]!.args).toEqual([5, 14]);
        expect(result).toEqual({ rows: [[1, 'a'], [2, 'b']], rowCount: 2 });
    });

    it('uses limit() when there is no offset, and range() when offset without limit', async () => {
        const { client, calls } = stubClient({ data: [] });
        await executeRest(
            client,
            { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [], limit: { kind: 'literal', value: 3 } },
            [],
        );
        expect(calls.map((call) => call.method)).toEqual(['select', 'limit']);
        expect(calls[1]!.args).toEqual([3]);

        const offsetOnly = stubClient({ data: [] });
        await executeRest(
            offsetOnly.client,
            { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [], offset: { kind: 'literal', value: 10 } },
            [],
        );
        expect(offsetOnly.calls.map((call) => call.method)).toEqual(['select', 'range']);
        expect(offsetOnly.calls[1]!.args).toEqual([10, Number.MAX_SAFE_INTEGER]);
    });

    it('inserts rows and returns the returning projection', async () => {
        const { client, calls } = stubClient({ data: [{ id: 7 }] });
        const result = await executeRest(
            client,
            {
                kind: 'insert',
                table: 't',
                columns: ['id', 'name'],
                rows: [[{ kind: 'param', index: 1 }, { kind: 'literal', value: 'x' }]],
                returning: [{ column: 'id' }],
            },
            [7],
        );
        expect(calls[0]!.method).toBe('insert');
        expect(calls[0]!.args[0]).toEqual([{ id: 7, name: 'x' }]);
        expect(calls[1]!.method).toBe('select');
        expect(result).toEqual({ rows: [[7]], rowCount: 1 });
    });

    it('maps on conflict do nothing and do update onto upsert', async () => {
        const nothing = stubClient({ data: null, count: 1 });
        await executeRest(
            nothing.client,
            { kind: 'insert', table: 't', columns: ['a'], rows: [[{ kind: 'literal', value: 1 }]], onConflict: { columns: ['a'], action: 'nothing' } },
            [],
        );
        expect(nothing.calls[0]!.method).toBe('upsert');
        expect(nothing.calls[0]!.args[1]).toEqual({ onConflict: 'a', ignoreDuplicates: true });

        const update = stubClient({ data: null, count: 1 });
        await executeRest(
            update.client,
            {
                kind: 'insert',
                table: 't',
                columns: ['a', 'b'],
                rows: [[{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }]],
                onConflict: { columns: ['a'], action: 'update', set: { b: { kind: 'excluded', column: 'b' } } },
            },
            [],
        );
        expect(update.calls[0]!.args[1]).toEqual({ onConflict: 'a', ignoreDuplicates: false });
    });

    it('rejects an upsert whose do-update set is not exactly the inserted values', async () => {
        const { client } = stubClient({ data: null });
        await expect(
            executeRest(
                client,
                {
                    kind: 'insert',
                    table: 't',
                    columns: ['a'],
                    rows: [[{ kind: 'literal', value: 1 }]],
                    onConflict: { columns: ['a'], action: 'update', set: { b: { kind: 'literal', value: 9 } } },
                },
                [],
            ),
        ).rejects.toThrow(UnsupportedSqlError);
    });

    it('updates and deletes, reporting the affected count when there is no returning', async () => {
        const update = stubClient({ data: null, count: 3 });
        expect(
            await executeRest(
                update.client,
                { kind: 'update', table: 't', set: { a: { kind: 'param', index: 1 } }, where: { kind: 'is', column: 'b', negated: false } },
                ['v'],
            ),
        ).toEqual({ rows: [], rowCount: 3 });
        expect(update.calls[0]!.method).toBe('update');
        expect(update.calls[0]!.args[0]).toEqual({ a: 'v' });
        expect(update.calls[1]!.method).toBe('select');
        expect(update.calls[1]!.args).toEqual(['', { count: 'exact', head: true }]);

        const remove = stubClient({ data: null, count: 1 });
        expect(await executeRest(remove.client, { kind: 'delete', table: 't', where: { kind: 'is', column: 'b', negated: false } }, [])).toEqual({ rows: [], rowCount: 1 });
        expect(remove.calls[0]!.method).toBe('delete');
    });

    it('updates and deletes without where as well', async () => {
        const update = stubClient({ data: null, count: 1 });
        expect(await executeRest(update.client, { kind: 'update', table: 't', set: { a: { kind: 'literal', value: 1 } } }, [])).toEqual({ rows: [], rowCount: 1 });

        const remove = stubClient({ data: null, count: 1 });
        expect(await executeRest(remove.client, { kind: 'delete', table: 't' }, [])).toEqual({ rows: [], rowCount: 1 });
    });

    it('handles null data when projection is present', async () => {
        const { client } = stubClient({ data: null });
        const result = await executeRest(client, { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [] }, []);
        expect(result).toEqual({ rows: [], rowCount: 0 });
    });

    it('rejects an upsert with null or non-object in set', async () => {
        const { client } = stubClient({ data: null });
        await expect(
            executeRest(
                client,
                {
                    kind: 'insert',
                    table: 't',
                    columns: ['a'],
                    rows: [[{ kind: 'literal', value: 1 }]],
                    onConflict: { columns: ['a'], action: 'update', set: { b: null as never } },
                },
                [],
            ),
        ).rejects.toThrow(UnsupportedSqlError);
    });

    it('rejects a projection of *', async () => {
        const { client } = stubClient({ data: [] });
        await expect(
            executeRest(client, { kind: 'select', table: 't', projection: 'all', orderBy: [] }, []),
        ).rejects.toThrow(UnsupportedSqlError);

        await expect(
            executeRest(client, { kind: 'delete', table: 't', returning: 'all' }, []),
        ).rejects.toThrow(UnsupportedSqlError);
    });

    it('surfaces a PostgREST error', async () => {
        const { client } = stubClient({ data: null, error: { message: 'permission denied' } });
        await expect(
            executeRest(client, { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [] }, []),
        ).rejects.toThrow('db: Supabase rejected the query — permission denied.');
    });

    it('treats a missing column in a returned row as null', async () => {
        const { client } = stubClient({ data: [{}] });
        expect(
            await executeRest(client, { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [] }, []),
        ).toEqual({ rows: [[null]], rowCount: 1 });
    });

    it('runs a count(*) select as a head request and returns one positional count', async () => {
        const { client, calls } = stubClient({ data: null, count: 42 });
        const result = await executeRest(
            client,
            { kind: 'select', table: 't', projection: 'count', orderBy: [] },
            [],
        );
        expect(calls[0]!.args).toEqual(['', { count: 'exact', head: true }]);
        expect(result).toEqual({ rows: [[42]], rowCount: 1 });
    });

    it('runs a count(*) select with where', async () => {
        const { client } = stubClient({ data: null, count: 10 });
        const result = await executeRest(
            client,
            { kind: 'select', table: 't', projection: 'count', orderBy: [], where: { kind: 'is', column: 'b', negated: false } },
            [],
        );
        expect(result).toEqual({ rows: [[10]], rowCount: 1 });
    });

    it('surfaces postgrest error on count(*) select', async () => {
        const { client } = stubClient({ data: null, error: { message: 'count error' } });
        await expect(
            executeRest(client, { kind: 'select', table: 't', projection: 'count', orderBy: [] }, []),
        ).rejects.toThrow('db: Supabase rejected the query — count error.');
    });

    it('rejects count in projectionOf for non-select', async () => {
        const { client } = stubClient({ data: null });
        await expect(
            executeRest(client, { kind: 'delete', table: 't', returning: 'count' as never }, []),
        ).rejects.toThrow(UnsupportedSqlError);
    });
});

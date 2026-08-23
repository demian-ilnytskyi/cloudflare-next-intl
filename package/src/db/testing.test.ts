import { describe, it, expect } from 'vitest';
import { makeFakeDb, rowsResult, executeResult } from './testing';

describe('FakeDrizzleDb', () => {
    it('resolves select() to the next queued rows result', async () => {
        const db = makeFakeDb([rowsResult([{ id: 1 }])]);
        const rows = await db.select().from('t');
        expect(rows).toEqual([{ id: 1 }]);
    });

    it('consumes queued results in call order across select/insert/update/delete', async () => {
        const db = makeFakeDb([
            rowsResult([{ id: 1 }]),
            rowsResult([{ id: 2 }]),
            rowsResult([{ id: 3 }]),
            rowsResult([{ id: 4 }]),
        ]);
        expect(await db.select().from('t')).toEqual([{ id: 1 }]);
        expect(await db.insert('t').values({})).toEqual([{ id: 2 }]);
        expect(await db.update('t').set({})).toEqual([{ id: 3 }]);
        expect(await db.delete('t')).toEqual([{ id: 4 }]);
    });

    it('resolves execute() to { rows } from an executeResult', async () => {
        const db = makeFakeDb([executeResult([{ ok: true }])]);
        const result = await db.execute('select 1');
        expect(result).toEqual({ rows: [{ ok: true }] });
    });

    it('throws a descriptive error when the queue runs out for a chain call', async () => {
        const db = makeFakeDb([]);
        await expect(db.select().from('t')).rejects.toThrow(/no queued result left for select/);
    });

    it('throws a descriptive error when the queue runs out for execute', async () => {
        const db = makeFakeDb([]);
        await expect(db.execute('select 1')).rejects.toThrow(/no queued result left for execute/);
    });

    it('records every intermediate chain call with its exact arguments', async () => {
        const db = makeFakeDb([rowsResult([])]);
        await db.select({ id: true }).from('t').where('id = 1').orderBy('id').limit(10).offset(5);
        const call = db.calls[0];
        expect(call.method).toBe('select');
        expect(call.args).toEqual([{ id: true }]);
        expect(call.chain.argsOf('from')).toEqual(['t']);
        expect(call.chain.argsOf('where')).toEqual(['id = 1']);
        expect(call.chain.argsOf('orderBy')).toEqual(['id']);
        expect(call.chain.argsOf('limit')).toEqual([10]);
        expect(call.chain.argsOf('offset')).toEqual([5]);
    });

    it('records leftJoin/innerJoin/groupBy/values/set/returning/as calls', async () => {
        const db = makeFakeDb([rowsResult([]), rowsResult([])]);
        await db.select().from('t').leftJoin('u', 'on').innerJoin('v', 'on').groupBy('id').as('alias');
        await db.insert('t').values({ a: 1 }).returning();
        const [selectCall, insertCall] = db.calls;
        expect(selectCall.chain.argsOf('leftJoin')).toEqual(['u', 'on']);
        expect(selectCall.chain.argsOf('innerJoin')).toEqual(['v', 'on']);
        expect(selectCall.chain.argsOf('groupBy')).toEqual(['id']);
        expect(selectCall.chain.argsOf('as')).toEqual(['alias']);
        expect(insertCall.chain.argsOf('values')).toEqual([{ a: 1 }]);
        expect(insertCall.chain.argsOf('returning')).toEqual([]);
    });

    it('argsOf returns undefined for a method never called on the chain', async () => {
        const db = makeFakeDb([rowsResult([])]);
        await db.select().from('t');
        expect(db.calls[0].chain.argsOf('where')).toBeUndefined();
    });

    it('supports update().set() recording the set() arguments', async () => {
        const db = makeFakeDb([rowsResult([])]);
        await db.update('t').set({ a: 1 }).where('id = 1');
        expect(db.calls[0].chain.argsOf('set')).toEqual([{ a: 1 }]);
    });

    it('$with returns a definition that is never consumed from the queue on its own', async () => {
        const db = makeFakeDb([rowsResult([{ id: 1 }])]);
        const cte = db.$with('cte').as('builder-marker');
        expect(cte).toBe('builder-marker');
        // queue is untouched by $with/.as — the one queued result is still there for the real query below
        const rows = await db.with().select().from('cte');
        expect(rows).toEqual([{ id: 1 }]);
    });

    it('with(...).select(...) delegates to select() and consumes the queue', async () => {
        const db = makeFakeDb([rowsResult([{ id: 9 }])]);
        const rows = await db.with('cte').select().from('cte');
        expect(rows).toEqual([{ id: 9 }]);
        expect(db.calls[0].method).toBe('select');
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, createClientMock } = vi.hoisted(() => {
    const rpc = vi.fn();
    const createClientMock = vi.fn(() => ({ rpc, from: vi.fn() }));
    return { rpc, createClientMock };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import runTransactionBatch from './transaction_batch.js';

const endpoint = { url: 'https://abc.supabase.co', anonKey: 'anon-key' };

beforeEach(() => {
    rpc.mockReset();
    createClientMock.mockClear();
});

describe('runTransactionBatch', () => {
    it('inlines params and sends every query as one cfni_exec_batch call', async () => {
        rpc.mockResolvedValue({
            data: [
                { rows: ['(1,a)'], rowCount: 1 },
                { rows: [], rowCount: 1 },
            ],
            error: null,
        });

        const result = await runTransactionBatch(endpoint, 'user-jwt', [
            { sql: 'insert into t (id, name) values ($1, $2) returning id, name', params: [1, 'a'] },
            { sql: 'update t set name = $1 where id = $2', params: ['b', 2] },
        ]);

        expect(rpc).toHaveBeenCalledWith('cfni_exec_batch', {
            statements: [
                "insert into t (id, name) values (1, 'a') returning id, name",
                "update t set name = 'b' where id = 2",
            ],
        });
        expect(result).toEqual([
            { rows: [['1', 'a']], rowCount: 1 },
            { rows: [], rowCount: 1 },
        ]);
    });

    it('forwards the bearer token via accessToken, same as a single-statement call', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        await runTransactionBatch(endpoint, 'user-jwt', []);
        const [, , options] = createClientMock.mock.calls[0]!;
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('user-jwt');
    });

    it('defaults the batch function to cfni_exec_batch', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        await runTransactionBatch(endpoint, 'anon-key', []);
        expect(rpc).toHaveBeenCalledWith('cfni_exec_batch', { statements: [] });
    });

    it('always uses cfni_exec_batch — not configurable like execFunction', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        await runTransactionBatch({ ...endpoint, execFunction: 'run_sql' }, 'anon-key', []);
        expect(rpc).toHaveBeenCalledWith('cfni_exec_batch', { statements: [] });
    });

    it('throws a descriptive error when the RPC call fails — the whole batch rolled back server-side', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'constraint violated', code: '23505' } });
        await expect(runTransactionBatch(endpoint, 'anon-key', [{ sql: 'select 1', params: [] }])).rejects.toThrow(
            /Supabase rejected the query — constraint violated/,
        );
    });

    it('names the install step when the batch function does not exist yet', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'not found', code: 'PGRST202' } });
        await expect(runTransactionBatch(endpoint, 'anon-key', [{ sql: 'select 1', params: [] }])).rejects.toThrow(
            /Install the cfni_exec_batch function from supabase\/cfni_exec\.sql/,
        );
    });

    it('throws when cfni_exec_batch returns something other than an array', async () => {
        rpc.mockResolvedValue({ data: { rows: [] }, error: null });
        await expect(runTransactionBatch(endpoint, 'anon-key', [{ sql: 'select 1', params: [] }])).rejects.toThrow(
            /returned a non-array result/,
        );
    });
});

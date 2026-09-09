import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, from, createClientMock } = vi.hoisted(() => {
    const rpc = vi.fn();
    const from = vi.fn();
    const createClientMock = vi.fn(() => ({ rpc, from }));
    return { rpc, from, createClientMock };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import createSupabaseTransport from './supabase_transport.js';

const endpoint = { url: 'https://abc.supabase.co', anonKey: 'anon-key' };

beforeEach(() => {
    rpc.mockReset();
    from.mockReset().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        then: vi.fn(),
    });
    createClientMock.mockClear();
});

describe('createSupabaseTransport', () => {
    it('builds a client for the resolved project and forwards the bearer token via accessToken', async () => {
        rpc.mockResolvedValue({ data: { rows: ['(1,a)'], rowCount: 1 }, error: null });
        const transport = createSupabaseTransport(endpoint, 'user-jwt');
        await transport('select $1', ['x'], 'all');

        const [url, key, options] = createClientMock.mock.calls[0]!;
        expect(url).toBe('https://abc.supabase.co');
        expect(key).toBe('anon-key');
        await expect(options.accessToken()).resolves.toBe('user-jwt');
    });

    it('inlines params into the statement before calling the configured exec function', async () => {
        rpc.mockResolvedValue({ data: { rows: ['(1,a)'], rowCount: 1 }, error: null });
        const transport = createSupabaseTransport({ ...endpoint, execFunction: 'run_sql' }, 'anon-key');
        const result = await transport('select * from t where id = $1', [1], 'all');

        expect(result).toEqual({ rows: [['1', 'a']], rowCount: 1 });
        expect(rpc).toHaveBeenCalledWith('run_sql', { statement: 'select * from t where id = 1' });
    });

    it('defaults the exec function to cfni_exec', async () => {
        rpc.mockResolvedValue({ data: { rows: [], rowCount: 0 }, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await transport('select 1', [], 'all');
        expect(rpc).toHaveBeenCalledWith('cfni_exec', { statement: 'select 1' });
    });

    it('returns an empty row set when the function yields no rows key', async () => {
        rpc.mockResolvedValue({ data: null, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('update t set a = "b"', [], 'execute')).resolves.toEqual({ rows: [], rowCount: null });
    });

    it('supports the legacy bare-array response shape', async () => {
        rpc.mockResolvedValue({ data: ['(1,a)'], error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).resolves.toEqual({ rows: [['1', 'a']], rowCount: null });
    });

    it('returns an empty row set when the object shape has a non-array rows value', async () => {
        rpc.mockResolvedValue({ data: { rows: null, rowCount: 0 }, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).resolves.toEqual({ rows: [], rowCount: 0 });
    });

    it('passes a non-string row through unchanged', async () => {
        rpc.mockResolvedValue({ data: { rows: [['1', 'a']], rowCount: 1 }, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).resolves.toEqual({ rows: [['1', 'a']], rowCount: 1 });
    });

    it('treats a non-number rowCount as null', async () => {
        rpc.mockResolvedValue({ data: { rows: [], rowCount: undefined }, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).resolves.toEqual({ rows: [], rowCount: null });
    });

    it('surfaces the postgrest error message', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'function cfni_exec does not exist', code: '42883' } });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).rejects.toThrow(/function cfni_exec does not exist/);
    });

    it('names the install step when postgrest reports a missing function', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).rejects.toThrow(/cfni_exec\.sql/);
    });

    it('names Firebase auth setup when postgrest reports an auth failure', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'JWSError', code: 'PGRST301' } });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('select 1', [], 'all')).rejects.toThrow(/Firebase/);
    });

    it('reuses one client across multiple calls with the same bearer token', async () => {
        rpc.mockResolvedValue({ data: { rows: [], rowCount: 0 }, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await transport('select 1', [], 'all');
        await transport('select 2', [], 'all');
        expect(createClientMock).toHaveBeenCalledTimes(1);
    });
});

describe('createSupabaseTransport — REST translation', () => {
    it('translates a supported statement instead of calling cfni_exec', async () => {
        const select = vi.fn(() => ({
            then: (fn: (value: unknown) => unknown) =>
                Promise.resolve(fn({ data: [{ id: 1 }], error: null, count: null })),
        }));
        from.mockReturnValue({ select });

        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon' }, 'anon');
        await expect(run('select "t"."id" from "t"', [], 'all')).resolves.toEqual({ rows: [[1]], rowCount: 1 });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('falls back to cfni_exec for an untranslatable statement', async () => {
        rpc.mockResolvedValue({ data: { rows: [], rowCount: 0 }, error: null });

        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon' }, 'anon');
        await run('select sum("a") from "t"', [], 'all');
        expect(rpc).toHaveBeenCalledWith('cfni_exec', { statement: 'select sum("a") from "t"' });
    });

    it('explains the limitation instead of falling back when rawSql is false', async () => {
        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon', rawSql: false }, 'anon');
        await expect(run('select sum("a") from "t"', [], 'all')).rejects.toThrow(
            /cannot be expressed through the Supabase REST API[\s\S]*db\.supabase\.rawSql[\s\S]*db\.connectionString/,
        );
        expect(rpc).not.toHaveBeenCalled();
    });

    it('rethrows non-UnsupportedSqlError errors directly', async () => {
        const select = vi.fn(() => ({
            then: (fn: (value: unknown) => unknown) =>
                Promise.resolve(fn({ data: null, error: { message: 'table does not exist' }, count: null })),
        }));
        from.mockReturnValue({ select });

        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon' }, 'anon');
        await expect(run('select "t"."id" from "t"', [], 'all')).rejects.toThrow(/Supabase rejected the query/);
    });
});

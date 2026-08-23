import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc, createClientMock } = vi.hoisted(() => {
    const rpc = vi.fn();
    const createClientMock = vi.fn(() => ({ rpc }));
    return { rpc, createClientMock };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import createSupabaseTransport from './supabase_transport';

const endpoint = { url: 'https://abc.supabase.co', anonKey: 'anon-key' };

beforeEach(() => {
    rpc.mockReset();
    createClientMock.mockClear();
});

describe('createSupabaseTransport', () => {
    it('builds a client for the resolved project and forwards the bearer token via accessToken', async () => {
        rpc.mockResolvedValue({ data: { rows: ['(1,a)'], rowCount: 1 }, error: null });
        const transport = createSupabaseTransport(endpoint, 'user-jwt');
        await transport('select $1', ['x'], 'all');

        const [url, key, options] = createClientMock.mock.calls[0];
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
        await expect(transport('update t set a = 1', [], 'execute')).resolves.toEqual({ rows: [], rowCount: null });
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

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
        rpc.mockResolvedValue({ data: [[1, 'a']], error: null });
        const transport = createSupabaseTransport(endpoint, 'user-jwt');
        await transport('select $1', ['x'], 'all');

        const [url, key, options] = createClientMock.mock.calls[0];
        expect(url).toBe('https://abc.supabase.co');
        expect(key).toBe('anon-key');
        await expect(options.accessToken()).resolves.toBe('user-jwt');
    });

    it('calls the configured exec function with statement and params', async () => {
        rpc.mockResolvedValue({ data: [[1, 'a']], error: null });
        const transport = createSupabaseTransport({ ...endpoint, execFunction: 'run_sql' }, 'anon-key');
        const result = await transport('select $1', ['x'], 'all');

        expect(result).toEqual({ rows: [[1, 'a']] });
        expect(rpc).toHaveBeenCalledWith('run_sql', { statement: 'select $1', params: ['x'] });
    });

    it('defaults the exec function to cfni_exec', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await transport('select 1', [], 'all');
        expect(rpc).toHaveBeenCalledWith('cfni_exec', { statement: 'select 1', params: [] });
    });

    it('returns an empty row set when the function yields null', async () => {
        rpc.mockResolvedValue({ data: null, error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await expect(transport('update t set a = 1', [], 'execute')).resolves.toEqual({ rows: [] });
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

    it('reuses one client across multiple calls with the same bearer token', async () => {
        rpc.mockResolvedValue({ data: [], error: null });
        const transport = createSupabaseTransport(endpoint, 'anon-key');
        await transport('select 1', [], 'all');
        await transport('select 2', [], 'all');
        expect(createClientMock).toHaveBeenCalledTimes(1);
    });
});

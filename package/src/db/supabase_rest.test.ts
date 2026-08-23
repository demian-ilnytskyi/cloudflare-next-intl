import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryState, createClientMock, rpcMock, getAuthUser } = vi.hoisted(() => {
    const queryState: { calls: { method: string; args: unknown[] }[]; result: unknown } = { calls: [], result: { data: [], error: null, count: null } };

    function makeBuilder() {
        const builder: Record<string, unknown> = {};
        const methods = [
            'select', 'insert', 'upsert', 'update', 'delete',
            'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
            'like', 'likeAllOf', 'likeAnyOf', 'ilike', 'ilikeAllOf', 'ilikeAnyOf',
            'regexMatch', 'regexIMatch', 'is', 'isDistinct', 'in',
            'contains', 'containedBy', 'overlaps',
            'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent',
            'textSearch', 'match', 'not', 'or', 'filter',
            'order', 'limit', 'range', 'single', 'maybeSingle',
        ];
        for (const method of methods) {
            builder[method] = vi.fn((...args: unknown[]) => {
                queryState.calls.push({ method, args });
                return builder;
            });
        }
        builder.then = (onfulfilled: (v: unknown) => unknown) => Promise.resolve(queryState.result).then(onfulfilled);
        return builder;
    }

    const rpcMock = vi.fn(async () => queryState.result);
    const createClientMock = vi.fn(() => ({ from: vi.fn(() => makeBuilder()), rpc: rpcMock }));
    const getAuthUser = vi.fn().mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue('firebase-jwt') }, loading: false });
    return { queryState, createClientMock, rpcMock, getAuthUser };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));
vi.mock('../firebase_auth/server/use_auth_user_server', () => ({ getAuthUser }));
vi.mock('../config/intl_config', () => ({
    default: {
        locales: ['en'],
        defaultLocale: 'en',
        db: { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' } },
        firebaseAuth: true,
    },
}));

import config from '../config/intl_config';
import {
    supabaseSelect,
    supabaseSelectAsUser,
    supabaseInsert,
    supabaseInsertAsUser,
    supabaseUpsert,
    supabaseUpsertAsUser,
    supabaseUpdate,
    supabaseUpdateAsUser,
    supabaseDelete,
    supabaseDeleteAsUser,
    supabaseRpc,
    supabaseRpcAsUser,
} from './supabase_rest';

beforeEach(() => {
    queryState.calls.length = 0;
    queryState.result = { data: [], error: null, count: null };
    createClientMock.mockClear();
    rpcMock.mockClear();
    (config as { db?: unknown }).db = { supabase: { url: 'https://abc.supabase.co', anonKey: 'anon-key' } };
});

describe('supabaseSelect', () => {
    it('throws when db.supabase is not set', async () => {
        (config as { db?: unknown }).db = {};
        await expect(supabaseSelect('t')).rejects.toThrow(/db\.supabase/);
    });

    it('uses the anon key as the bearer token', async () => {
        await supabaseSelect('t');
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('anon-key');
    });

    it('applies a bare-value filter as eq', async () => {
        await supabaseSelect('t', { where: { id: 5 } });
        expect(queryState.calls).toContainEqual({ method: 'eq', args: ['id', 5] });
    });

    it('applies an [operator, value] filter', async () => {
        await supabaseSelect('t', { where: { age: ['gt', 18] } });
        expect(queryState.calls).toContainEqual({ method: 'gt', args: ['age', 18] });
    });

    it('applies a negated [not, operator, value] filter', async () => {
        await supabaseSelect('t', { where: { age: ['not', 'eq', 18] } });
        expect(queryState.calls).toContainEqual({ method: 'not', args: ['age', 'eq', 18] });
    });

    it('applies an array-valued operator like likeAllOf', async () => {
        await supabaseSelect('t', { where: { name: ['likeAllOf', ['%a%', '%b%']] } });
        expect(queryState.calls).toContainEqual({ method: 'likeAllOf', args: ['name', ['%a%', '%b%']] });
    });

    it('applies match, or, and textSearch', async () => {
        await supabaseSelect('t', {
            match: { status: 'active' },
            or: 'age.gt.18,status.eq.pending',
            textSearch: { column: 'body', query: 'cats', type: 'websearch' },
        });
        expect(queryState.calls).toContainEqual({ method: 'match', args: [{ status: 'active' }] });
        expect(queryState.calls).toContainEqual({ method: 'or', args: ['age.gt.18,status.eq.pending', { referencedTable: undefined }] });
        expect(queryState.calls).toContainEqual({ method: 'textSearch', args: ['body', 'cats', { type: 'websearch', config: undefined }] });
    });

    it('applies or given as an object with a referencedTable', async () => {
        await supabaseSelect('t', { or: { filters: 'age.gt.18', referencedTable: 'orders' } });
        expect(queryState.calls).toContainEqual({ method: 'or', args: ['age.gt.18', { referencedTable: 'orders' }] });
    });

    it('applies a single (non-array) orderBy clause', async () => {
        await supabaseSelect('t', { orderBy: { column: 'a', ascending: true } });
        expect(queryState.calls).toContainEqual({ method: 'order', args: ['a', { ascending: true, nullsFirst: undefined }] });
    });

    it('applies ordering, limit, and range', async () => {
        await supabaseSelect('t', {
            orderBy: [{ column: 'a', ascending: true }, { column: 'b', ascending: false }],
            limit: 10,
            range: [0, 9],
        });
        expect(queryState.calls).toContainEqual({ method: 'order', args: ['a', { ascending: true, nullsFirst: undefined }] });
        expect(queryState.calls).toContainEqual({ method: 'order', args: ['b', { ascending: false, nullsFirst: undefined }] });
        expect(queryState.calls).toContainEqual({ method: 'limit', args: [10] });
        expect(queryState.calls).toContainEqual({ method: 'range', args: [0, 9] });
    });

    it('returns rows and count', async () => {
        queryState.result = { data: [{ id: 1 }], error: null, count: 1 };
        const result = await supabaseSelect('t', { count: 'exact' });
        expect(result).toEqual({ rows: [{ id: 1 }], count: 1 });
    });

    it('wraps a single result as a one-row array', async () => {
        queryState.result = { data: { id: 1 }, error: null, count: null };
        const result = await supabaseSelect('t', { single: true });
        expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('returns an empty row array when maybeSingle finds nothing', async () => {
        queryState.result = { data: null, error: null, count: null };
        const result = await supabaseSelect('t', { maybeSingle: true });
        expect(result.rows).toEqual([]);
    });

    it('throws a descriptive error on a PostgREST failure', async () => {
        queryState.result = { data: null, error: { message: 'permission denied' }, count: null };
        await expect(supabaseSelect('t')).rejects.toThrow(/permission denied/);
    });

    it('returns an empty row array when a plain (non-single) select yields null data', async () => {
        queryState.result = { data: null, error: null, count: null };
        await expect(supabaseSelect('t')).resolves.toEqual({ rows: [], count: null });
    });
});

describe('supabaseSelectAsUser', () => {
    it('uses the resolved access token as the bearer token', async () => {
        await supabaseSelectAsUser('t');
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('firebase-jwt');
    });
});

describe('supabaseInsert', () => {
    it('inserts and selects the result', async () => {
        queryState.result = { data: [{ id: 1 }], error: null, count: null };
        const result = await supabaseInsert('t', { name: 'x' });
        expect(queryState.calls).toContainEqual({ method: 'insert', args: [{ name: 'x' }] });
        expect(result).toEqual([{ id: 1 }]);
    });
});

describe('supabaseInsertAsUser', () => {
    it('uses the resolved access token as the bearer token', async () => {
        await supabaseInsertAsUser('t', { name: 'x' });
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('firebase-jwt');
    });
});

describe('supabaseInsert error/empty handling', () => {
    it('throws a descriptive error on a PostgREST failure', async () => {
        queryState.result = { data: null, error: { message: 'permission denied' }, count: null };
        await expect(supabaseInsert('t', { name: 'x' })).rejects.toThrow(/permission denied/);
    });

    it('returns an empty array when data is null with no error', async () => {
        queryState.result = { data: null, error: null, count: null };
        await expect(supabaseInsert('t', { name: 'x' })).resolves.toEqual([]);
    });
});

describe('supabaseUpsert', () => {
    it('passes onConflict and ignoreDuplicates through', async () => {
        await supabaseUpsert('t', { id: 1 }, { onConflict: 'id', ignoreDuplicates: true });
        expect(queryState.calls).toContainEqual({ method: 'upsert', args: [{ id: 1 }, { onConflict: 'id', ignoreDuplicates: true }] });
    });

    it('throws a descriptive error on a PostgREST failure', async () => {
        queryState.result = { data: null, error: { message: 'permission denied' }, count: null };
        await expect(supabaseUpsert('t', { id: 1 })).rejects.toThrow(/permission denied/);
    });

    it('returns an empty array when data is null with no error', async () => {
        queryState.result = { data: null, error: null, count: null };
        await expect(supabaseUpsert('t', { id: 1 })).resolves.toEqual([]);
    });
});

describe('supabaseUpsertAsUser', () => {
    it('uses the resolved access token as the bearer token', async () => {
        await supabaseUpsertAsUser('t', { id: 1 });
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('firebase-jwt');
    });
});

describe('supabaseUpdate', () => {
    it('requires a where filter', async () => {
        await expect(supabaseUpdate('t', { name: 'x' }, {})).rejects.toThrow(/where/);
    });

    it('applies the filter and updates', async () => {
        await supabaseUpdate('t', { name: 'x' }, { where: { id: 1 } });
        expect(queryState.calls).toContainEqual({ method: 'update', args: [{ name: 'x' }] });
        expect(queryState.calls).toContainEqual({ method: 'eq', args: ['id', 1] });
    });

    it('accepts match alone in place of where', async () => {
        await supabaseUpdate('t', { name: 'x' }, { match: { id: 1 } });
        expect(queryState.calls).toContainEqual({ method: 'match', args: [{ id: 1 }] });
    });

    it('accepts or alone in place of where', async () => {
        await supabaseUpdate('t', { name: 'x' }, { or: 'id.eq.1,id.eq.2' });
        expect(queryState.calls).toContainEqual({ method: 'or', args: ['id.eq.1,id.eq.2', { referencedTable: undefined }] });
    });

    it('throws a descriptive error on a PostgREST failure', async () => {
        queryState.result = { data: null, error: { message: 'permission denied' }, count: null };
        await expect(supabaseUpdate('t', { name: 'x' }, { where: { id: 1 } })).rejects.toThrow(/permission denied/);
    });

    it('returns an empty array when data is null with no error', async () => {
        queryState.result = { data: null, error: null, count: null };
        await expect(supabaseUpdate('t', { name: 'x' }, { where: { id: 1 } })).resolves.toEqual([]);
    });
});

describe('supabaseUpdateAsUser', () => {
    it('uses the resolved access token as the bearer token', async () => {
        await supabaseUpdateAsUser('t', { name: 'x' }, { where: { id: 1 } });
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('firebase-jwt');
    });
});

describe('supabaseDelete', () => {
    it('requires a where filter', async () => {
        await expect(supabaseDelete('t', {})).rejects.toThrow(/where/);
    });

    it('applies the filter and deletes', async () => {
        await supabaseDelete('t', { where: { id: 1 } });
        expect(queryState.calls).toContainEqual({ method: 'delete', args: [] });
        expect(queryState.calls).toContainEqual({ method: 'eq', args: ['id', 1] });
    });

    it('throws a descriptive error on a PostgREST failure', async () => {
        queryState.result = { data: null, error: { message: 'permission denied' }, count: null };
        await expect(supabaseDelete('t', { where: { id: 1 } })).rejects.toThrow(/permission denied/);
    });

    it('returns an empty array when data is null with no error', async () => {
        queryState.result = { data: null, error: null, count: null };
        await expect(supabaseDelete('t', { where: { id: 1 } })).resolves.toEqual([]);
    });
});

describe('supabaseDeleteAsUser', () => {
    it('uses the resolved access token as the bearer token', async () => {
        await supabaseDeleteAsUser('t', { where: { id: 1 } });
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('firebase-jwt');
    });
});

describe('supabaseRpc', () => {
    it('calls the named function with args', async () => {
        queryState.result = { data: 42, error: null, count: null };
        const result = await supabaseRpc('add', { a: 1, b: 2 });
        expect(rpcMock).toHaveBeenCalledWith('add', { a: 1, b: 2 });
        expect(result).toBe(42);
    });

    it('throws a descriptive error on failure', async () => {
        queryState.result = { data: null, error: { message: 'no such function' }, count: null };
        await expect(supabaseRpc('missing')).rejects.toThrow(/no such function/);
    });
});

describe('supabaseRpcAsUser', () => {
    it('uses the resolved access token as the bearer token', async () => {
        await supabaseRpcAsUser('add', { a: 1 });
        const [, , options] = createClientMock.mock.calls[0];
        await expect((options as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('firebase-jwt');
    });
});

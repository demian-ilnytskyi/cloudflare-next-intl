import { describe, it, expect } from 'vitest';
import resolveDbMode from './resolve_mode';

describe('resolveDbMode', () => {
    it('picks postgres for a connection string', async () => {
        await expect(resolveDbMode({ connectionString: 'postgresql://x' })).resolves.toEqual({
            mode: 'postgres',
            connectionString: 'postgresql://x',
        });
    });

    it('picks postgres for a connectionString function that resolves to a string', async () => {
        await expect(resolveDbMode({ connectionString: () => 'postgresql://x' })).resolves.toEqual({
            mode: 'postgres',
            connectionString: 'postgresql://x',
        });
    });

    it('picks postgres for an async connectionString function', async () => {
        await expect(resolveDbMode({ connectionString: async () => 'postgresql://x' })).resolves.toEqual({
            mode: 'postgres',
            connectionString: 'postgresql://x',
        });
    });

    it('picks supabase when a supabase block is set', async () => {
        const supabase = { url: 'https://abc.supabase.co' };
        await expect(resolveDbMode({ supabase })).resolves.toEqual({ mode: 'supabase', supabase });
    });

    it('prefers postgres when both are configured', async () => {
        await expect(resolveDbMode({ connectionString: 'postgresql://x', supabase: {} })).resolves.toEqual({
            mode: 'postgres',
            connectionString: 'postgresql://x',
        });
    });

    it('falls through to supabase when a connectionString function resolves to null', async () => {
        const supabase = {};
        await expect(resolveDbMode({ connectionString: () => null, supabase })).resolves.toEqual({
            mode: 'supabase',
            supabase,
        });
    });

    it('falls through to supabase when a connectionString function resolves to undefined', async () => {
        const supabase = {};
        await expect(resolveDbMode({ connectionString: () => undefined, supabase })).resolves.toEqual({
            mode: 'supabase',
            supabase,
        });
    });

    it('defaults to postgres with an undefined connectionString when nothing resolves and there is no supabase block', async () => {
        await expect(resolveDbMode({ connectionString: () => null })).resolves.toEqual({
            mode: 'postgres',
            connectionString: undefined,
        });
    });

    it('defaults to postgres when nothing is set, so connectToPostgres raises the specific error', async () => {
        await expect(resolveDbMode({})).resolves.toEqual({ mode: 'postgres', connectionString: undefined });
    });
});

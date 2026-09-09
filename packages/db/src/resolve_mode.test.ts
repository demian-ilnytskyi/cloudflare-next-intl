import { describe, it, expect, vi, beforeEach } from 'vitest';
import resolveDbMode from './resolve_mode.js';

vi.mock('./resolve_hyperdrive_connection_string.js', () => ({
    resolveHyperdriveConnectionString: vi.fn(async () => undefined),
}));
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';

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

describe('resolveDbMode — Hyperdrive auto-detection', () => {
    beforeEach(() => vi.mocked(resolveHyperdriveConnectionString).mockReset());

    it('uses the Hyperdrive connection string when db.connectionString is unset', async () => {
        vi.mocked(resolveHyperdriveConnectionString).mockResolvedValue('postgresql://hyperdrive/db');
        const result = await resolveDbMode({}, {});
        expect(result).toEqual({ mode: 'postgres', connectionString: 'postgresql://hyperdrive/db' });
    });

    it('prefers an explicit db.connectionString over Hyperdrive', async () => {
        vi.mocked(resolveHyperdriveConnectionString).mockResolvedValue('postgresql://hyperdrive/db');
        const result = await resolveDbMode({ connectionString: 'postgresql://explicit/db' }, {});
        expect(result).toEqual({ mode: 'postgres', connectionString: 'postgresql://explicit/db' });
        expect(resolveHyperdriveConnectionString).not.toHaveBeenCalled();
    });

    it('skips Hyperdrive entirely when autoHyperdrive is false, falling through to supabase', async () => {
        const supabase = { anonKey: 'k', url: 'https://x.supabase.co' };
        const result = await resolveDbMode({ autoHyperdrive: false, supabase }, {});
        expect(result).toEqual({ mode: 'supabase', supabase });
        expect(resolveHyperdriveConnectionString).not.toHaveBeenCalled();
    });

    it('falls through to supabase when Hyperdrive resolves to nothing', async () => {
        vi.mocked(resolveHyperdriveConnectionString).mockResolvedValue(undefined);
        const supabase = { anonKey: 'k', url: 'https://x.supabase.co' };
        const result = await resolveDbMode({ supabase }, {});
        expect(result).toEqual({ mode: 'supabase', supabase });
    });
});

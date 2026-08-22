import { describe, it, expect } from 'vitest';
import resolveDbMode from './resolve_mode';

describe('resolveDbMode', () => {
    it('picks postgres for a connection string', () => {
        expect(resolveDbMode({ connectionString: 'postgresql://x' })).toBe('postgres');
    });

    it('picks postgres for a hyperdrive binding', () => {
        expect(resolveDbMode({ hyperdriveBinding: 'HYPERDRIVE' })).toBe('postgres');
    });

    it('picks supabase when a supabase block is set', () => {
        expect(resolveDbMode({ supabase: {} })).toBe('supabase');
    });

    it('prefers postgres when both are configured', () => {
        expect(resolveDbMode({ connectionString: 'postgresql://x', supabase: {} })).toBe('postgres');
    });

    it('defaults to postgres when nothing is set, so the existing hyperdrive default still applies', () => {
        expect(resolveDbMode({})).toBe('postgres');
    });
});

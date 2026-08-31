import { describe, it, expect, afterEach } from 'vitest';
import resolveSupabaseEndpoint from './supabase_config.js';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe('resolveSupabaseEndpoint', () => {
    it('resolves the url and anon key from explicit config', async () => {
        const result = await resolveSupabaseEndpoint({ url: 'https://abc.supabase.co', anonKey: 'key' });
        expect(result).toEqual({ url: 'https://abc.supabase.co', anonKey: 'key' });
    });

    it('strips a trailing slash from the project url', async () => {
        const result = await resolveSupabaseEndpoint({ url: 'https://abc.supabase.co/', anonKey: 'key' });
        expect(result.url).toBe('https://abc.supabase.co');
    });

    it('falls back to the NEXT_PUBLIC env vars', async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://env.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'env-key';
        const result = await resolveSupabaseEndpoint({});
        expect(result).toEqual({ url: 'https://env.supabase.co', anonKey: 'env-key' });
    });

    it('resolves url and anon key given as sync and async functions', async () => {
        const result = await resolveSupabaseEndpoint({
            url: () => 'https://fn.supabase.co',
            anonKey: async () => 'fn-key',
        });
        expect(result).toEqual({ url: 'https://fn.supabase.co', anonKey: 'fn-key' });
    });

    it('throws naming the env var when no url resolves', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        await expect(resolveSupabaseEndpoint({ anonKey: 'key' })).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });

    it('throws naming the env var when no anon key resolves', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        await expect(resolveSupabaseEndpoint({ url: 'https://abc.supabase.co' })).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    });
});

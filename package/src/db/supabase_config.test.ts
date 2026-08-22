import { describe, it, expect, afterEach } from 'vitest';
import resolveSupabaseEndpoint from './supabase_config';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe('resolveSupabaseEndpoint', () => {
    it('resolves the url and anon key from explicit config', () => {
        const result = resolveSupabaseEndpoint({ url: 'https://abc.supabase.co', anonKey: 'key' });
        expect(result).toEqual({ url: 'https://abc.supabase.co', anonKey: 'key' });
    });

    it('strips a trailing slash from the project url', () => {
        const result = resolveSupabaseEndpoint({ url: 'https://abc.supabase.co/', anonKey: 'key' });
        expect(result.url).toBe('https://abc.supabase.co');
    });

    it('falls back to the NEXT_PUBLIC env vars', () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://env.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'env-key';
        const result = resolveSupabaseEndpoint({});
        expect(result).toEqual({ url: 'https://env.supabase.co', anonKey: 'env-key' });
    });

    it('throws naming the env var when no url resolves', () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        expect(() => resolveSupabaseEndpoint({ anonKey: 'key' })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });

    it('throws naming the env var when no anon key resolves', () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        expect(() => resolveSupabaseEndpoint({ url: 'https://abc.supabase.co' })).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    });
});

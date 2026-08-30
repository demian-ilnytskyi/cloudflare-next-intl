import { beforeEach, describe, expect, it, vi } from 'vitest';
import createRestClient from './rest_client.js';

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

describe('createRestClient', () => {
    beforeEach(() => {
        createClient.mockReset().mockReturnValue({ from: vi.fn(), rpc: vi.fn() });
    });

    it('creates one client from the resolved endpoint and reuses it', async () => {
        const getClient = createRestClient({ url: 'https://p.supabase.co/', anonKey: 'anon' }, 'bearer');
        const first = await getClient();
        const second = await getClient();
        expect(first).toBe(second);
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(createClient.mock.calls[0]![0]).toBe('https://p.supabase.co');
        expect(createClient.mock.calls[0]![1]).toBe('anon');
        await expect((createClient.mock.calls[0]![2] as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('bearer');
    });
});

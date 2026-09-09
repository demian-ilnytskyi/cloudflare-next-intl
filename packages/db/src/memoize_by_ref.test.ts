import { describe, it, expect, vi } from 'vitest';
import memoizeByRef from './memoize_by_ref.js';

describe('memoizeByRef', () => {
    it('calls the underlying function once for the same first-argument reference', async () => {
        const fn = vi.fn(async (key: object, extra: number) => extra * 2);
        const memoized = memoizeByRef(fn);
        const key = {};

        const [a, b] = await Promise.all([memoized(key, 3), memoized(key, 3)]);

        expect(a).toBe(6);
        expect(b).toBe(6);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('calls the underlying function again for a different first-argument reference', async () => {
        const fn = vi.fn(async (key: object) => key);
        const memoized = memoizeByRef(fn);

        await memoized({});
        await memoized({});

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not cache a rejected call — a later call with the same key retries', async () => {
        let calls = 0;
        const fn = vi.fn(async (key: object) => {
            calls += 1;
            if (calls === 1) throw new Error('boom');
            return 'ok';
        });
        const memoized = memoizeByRef(fn);
        const key = {};

        await expect(memoized(key)).rejects.toThrow('boom');
        await expect(memoized(key)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

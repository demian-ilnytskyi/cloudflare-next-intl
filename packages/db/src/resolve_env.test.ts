import { describe, it, expect, vi } from 'vitest';
import resolveEnv from './resolve_env.js';
import type { GenerateRoutingConfig } from './types.js';

describe('resolveEnv', () => {
    it('returns undefined when generate is unset', async () => {
        expect(await resolveEnv(undefined)).toBeUndefined();
    });

    it('returns generate.env directly when it is an object', async () => {
        const env = { HYPERDRIVE: { connectionString: 'postgres://x' } };
        expect(await resolveEnv({ env })).toBe(env);
    });

    it('awaits generate.env when it is a function', async () => {
        const env = { FOO: 'bar' };
        const generate: GenerateRoutingConfig = { env: async () => env };
        expect(await resolveEnv(generate)).toBe(env);
    });

    it('falls back to getCloudflareContext when env is unset', async () => {
        const ctxEnv = { HYPERDRIVE: { connectionString: 'postgres://y' } };
        const getCloudflareContext = vi.fn(async () => ({ env: ctxEnv }));
        expect(await resolveEnv({ getCloudflareContext })).toBe(ctxEnv);
        expect(getCloudflareContext).toHaveBeenCalledWith({ async: true });
    });

    it('returns undefined when getCloudflareContext throws', async () => {
        const generate: GenerateRoutingConfig = {
            getCloudflareContext: async () => { throw new Error('no context here'); },
        };
        expect(await resolveEnv(generate)).toBeUndefined();
    });

    it('returns undefined when neither env nor getCloudflareContext is set', async () => {
        expect(await resolveEnv({})).toBeUndefined();
    });

    it('memoizes by the generate object reference', async () => {
        const getCloudflareContext = vi.fn(async () => ({ env: {} }));
        const generate: GenerateRoutingConfig = { getCloudflareContext };
        await Promise.all([resolveEnv(generate), resolveEnv(generate)]);
        expect(getCloudflareContext).toHaveBeenCalledTimes(1);
    });
});

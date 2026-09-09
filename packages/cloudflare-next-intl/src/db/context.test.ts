import { describe, it, expect, vi } from 'vitest';

const withPublicDbImpl = vi.fn(async (fn: (db: unknown) => unknown) => fn({}));
const withUserDbImpl = vi.fn(async (fn: (db: unknown) => unknown) => fn({}));
const resolveUserDbCredentialsImpl = vi.fn(async () => ({ uid: 'u1', accessToken: 't1', role: 'authenticated' }));

vi.mock('@cloudflare-next-intl/db', () => ({
    withPublicDb: withPublicDbImpl,
    withUserDb: withUserDbImpl,
    resolveUserDbCredentials: resolveUserDbCredentialsImpl,
}));

const resolveDbConfigMock = vi.fn(async () => ({ db: { connectionString: 'postgres://resolved' } }));
vi.mock('./resolve_db_config.js', () => ({ default: resolveDbConfigMock }));

const { withPublicDb, withUserDb, resolveUserDbCredentials } = await import('./context.js');

describe('context.ts wrapper', () => {
    it('withPublicDb resolves config via resolve_db_config then delegates to @cloudflare-next-intl/db', async () => {
        const fn = vi.fn(async () => 'result');
        const result = await withPublicDb(fn, { connectionString: 'override' });

        expect(resolveDbConfigMock).toHaveBeenCalledWith({ connectionString: 'override' });
        expect(withPublicDbImpl).toHaveBeenCalledWith(fn, { db: { connectionString: 'postgres://resolved' } });
        expect(result).toBe('result');
    });

    it('withUserDb resolves config and forwards auth', async () => {
        const fn = vi.fn(async () => 'result');
        await withUserDb(fn, 'explicit-uid', undefined);

        expect(resolveDbConfigMock).toHaveBeenCalledWith(undefined);
        expect(withUserDbImpl).toHaveBeenCalledWith(fn, 'explicit-uid', { db: { connectionString: 'postgres://resolved' } });
    });

    it('resolveUserDbCredentials resolves config and delegates', async () => {
        const result = await resolveUserDbCredentials();

        expect(resolveUserDbCredentialsImpl).toHaveBeenCalledWith({ db: { connectionString: 'postgres://resolved' } });
        expect(result).toEqual({ uid: 'u1', accessToken: 't1', role: 'authenticated' });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { connect, end, query, on, ClientMock, reportErrorMock } = vi.hoisted(() => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const end = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const on = vi.fn();
    const ClientMock = vi.fn(() => ({ connect, end, query, on }));
    const reportErrorMock = vi.fn().mockResolvedValue(undefined);
    return { connect, end, query, on, ClientMock, reportErrorMock };
});

vi.mock('pg', () => ({ Client: ClientMock }));
vi.mock('../error_handling/report_error', () => ({ default: reportErrorMock }));

import {
    withDbClient,
    resetConnectionState,
    withSessionLock,
    connectToPostgres,
    disconnectPostgres,
} from './connection.js';

const baseConfig = { locales: ['en'] as const, defaultLocale: 'en' };
const pgConfig = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;

beforeEach(() => {
    ClientMock.mockClear();
    connect.mockClear();
    end.mockClear();
    query.mockClear();
    on.mockClear();
    reportErrorMock.mockClear();
});

describe('withDbClient config resolution', () => {
    it('throws when db config is missing', async () => {
        await expect(withDbClient({ ...baseConfig } as never, vi.fn())).rejects.toThrow(/`db` is not set/);
    });

    it('throws when no connectionString resolves', async () => {
        await expect(withDbClient({ ...baseConfig, db: {} } as never, vi.fn())).rejects.toThrow(/connection string/i);
    });

    it('resolves connectionString given as an async function', async () => {
        const config = { ...baseConfig, db: { connectionString: vi.fn().mockResolvedValue('postgresql://dynamo') } } as never;
        await withDbClient(config, vi.fn());
        expect(ClientMock).toHaveBeenCalledWith({ connectionString: 'postgresql://dynamo' });
    });

    it('resolves connectionString given as a sync function', async () => {
        const config = { ...baseConfig, db: { connectionString: () => 'postgresql://sync' } } as never;
        await withDbClient(config, vi.fn());
        expect(ClientMock).toHaveBeenCalledWith({ connectionString: 'postgresql://sync' });
    });

    it('throws pointing at connectionString when a resolver returns nothing', async () => {
        const config = { ...baseConfig, db: { connectionString: () => undefined } } as never;
        await expect(withDbClient(config, vi.fn())).rejects.toThrow(/`db.connectionString`/);
    });

    it('gives each concurrent call its own client and closes both', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        const [a, b] = await Promise.all([withDbClient(pgConfig, fn), withDbClient(pgConfig, fn)]);

        expect([a, b]).toEqual(['success', 'success']);
        expect(ClientMock).toHaveBeenCalledTimes(2);
        expect(connect).toHaveBeenCalledTimes(2);
        expect(end).toHaveBeenCalledTimes(2);
    });

    it('passes the connected client to the callback', async () => {
        const fn = vi.fn().mockResolvedValue(undefined);
        await withDbClient(pgConfig, fn);
        expect(fn).toHaveBeenCalledWith(expect.objectContaining({ query }));
    });
});

describe('withDbClient error handling', () => {
    it('reports and rethrows when connect() fails', async () => {
        connect.mockRejectedValueOnce(new Error('FATAL Connection Refused.'));

        await expect(withDbClient(pgConfig, vi.fn())).rejects.toThrow('FATAL Connection Refused.');

        expect(reportErrorMock).toHaveBeenCalledTimes(1);
        expect(reportErrorMock.mock.calls[0][1]).toMatchObject({ classOrMethodName: 'db.withDbClient.connectError' });
    });

    it('does not call end() when connect() never succeeded', async () => {
        connect.mockRejectedValueOnce(new Error('FATAL Connection Refused.'));
        await expect(withDbClient(pgConfig, vi.fn())).rejects.toThrow();
        expect(end).not.toHaveBeenCalled();
    });

    it.each([
        ['Connection closed'],
        ['socket closed'],
        ['connection terminated unexpectedly'],
        ['unexpected eof on client connection'],
    ])('does not report expected socket teardown from connect(): "%s"', async (message) => {
        connect.mockRejectedValueOnce(new Error(message));
        await expect(withDbClient(pgConfig, vi.fn())).rejects.toThrow();
        expect(reportErrorMock).not.toHaveBeenCalled();
    });

    it('reports a non-Error connect() rejection without throwing on `.message`', async () => {
        connect.mockRejectedValueOnce({ something: 'odd' });
        await expect(withDbClient(pgConfig, vi.fn())).rejects.toEqual({ something: 'odd' });
        expect(reportErrorMock).toHaveBeenCalledTimes(1);
    });

    it('reports a null connect() rejection', async () => {
        connect.mockRejectedValueOnce(null);
        await expect(withDbClient(pgConfig, vi.fn())).rejects.toBeNull();
        expect(reportErrorMock).toHaveBeenCalledTimes(1);
    });

    it('rethrows callback errors without reporting them as client errors', async () => {
        const appError = new Error('row not found');
        await expect(withDbClient(pgConfig, vi.fn().mockRejectedValue(appError))).rejects.toThrow('row not found');

        expect(reportErrorMock).not.toHaveBeenCalled();
        expect(end).toHaveBeenCalledTimes(1);
    });
});

describe('withDbClient teardown', () => {
    it('awaits end() when there is no Cloudflare context', async () => {
        end.mockRejectedValueOnce(new Error('teardown failed'));
        await expect(withDbClient(pgConfig, vi.fn())).resolves.toBeUndefined();
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('awaits end() without consulting the context when disconnectAfterRequest is false', async () => {
        const getCloudflareContext = vi.fn().mockResolvedValue(null);
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x', disconnectAfterRequest: false },
            generate: { getCloudflareContext },
        } as never;

        end.mockRejectedValueOnce(new Error('teardown failed'));
        await withDbClient(config, vi.fn());

        expect(getCloudflareContext).not.toHaveBeenCalled();
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('defers end() to ctx.waitUntil when available', async () => {
        let deferred: Promise<unknown> | null = null;
        const waitUntil = vi.fn((promise: Promise<unknown>) => { deferred = promise; });
        const getCloudflareContext = vi.fn().mockResolvedValue({ ctx: { waitUntil } });
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' }, generate: { getCloudflareContext } } as never;

        end.mockRejectedValueOnce(new Error('teardown failed'));
        await withDbClient(config, vi.fn());

        expect(waitUntil).toHaveBeenCalledTimes(1);
        await expect(deferred).resolves.toBeUndefined();
    });

    it('falls back to awaiting end() when the context has no ctx', async () => {
        const getCloudflareContext = vi.fn().mockResolvedValue({});
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' }, generate: { getCloudflareContext } } as never;

        end.mockRejectedValueOnce(new Error('teardown failed'));
        await withDbClient(config, vi.fn());
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('falls back to awaiting end() when waitUntil is not a function', async () => {
        const getCloudflareContext = vi.fn().mockResolvedValue({ ctx: { waitUntil: 'nope' } });
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' }, generate: { getCloudflareContext } } as never;

        end.mockRejectedValueOnce(new Error('teardown failed'));
        await withDbClient(config, vi.fn());
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('falls back to awaiting end() when getCloudflareContext rejects', async () => {
        const getCloudflareContext = vi.fn().mockRejectedValue(new Error('no context'));
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' }, generate: { getCloudflareContext } } as never;

        end.mockRejectedValueOnce(new Error('teardown failed'));
        await withDbClient(config, vi.fn());

        expect(getCloudflareContext).toHaveBeenCalledTimes(1);
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('resolves connection string from env.HYPERDRIVE when connectionString is omitted', async () => {
        const config = {
            ...baseConfig,
            db: {},
            generate: { env: { HYPERDRIVE: { connectionString: 'postgresql://hyperdrive:5432/db' } } },
        } as never;

        await withDbClient(config, vi.fn());
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('throws when HYPERDRIVE connectionString is default localhost dummy', async () => {
        const config = {
            ...baseConfig,
            db: {},
            generate: { env: { HYPERDRIVE: { connectionString: 'postgresql://user:pass@localhost:5432/db' } } },
        } as never;

        await expect(withDbClient(config, vi.fn())).rejects.toThrow('could not resolve a Postgres connection string');
    });

    it('defers end() to generate.ctx.waitUntil when provided as object', async () => {
        const waitUntil = vi.fn();
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x' },
            generate: { ctx: { waitUntil } },
        } as never;

        await withDbClient(config, vi.fn());
        expect(waitUntil).toHaveBeenCalledTimes(1);
    });

    it('defers end() to generate.ctx.waitUntil when provided as getter function', async () => {
        const waitUntil = vi.fn();
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x' },
            generate: { ctx: () => ({ waitUntil }) },
        } as never;

        await withDbClient(config, vi.fn());
        expect(waitUntil).toHaveBeenCalledTimes(1);
    });

    it('closes the client even when the callback throws', async () => {
        await expect(withDbClient(pgConfig, vi.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow('boom');
        expect(end).toHaveBeenCalledTimes(1);
    });
});

describe('deprecated compatibility exports', () => {
    it('withSessionLock runs the callback directly', async () => {
        await expect(withSessionLock(async () => 505)).resolves.toBe(505);
    });

    it('resetConnectionState is a no-op', () => {
        expect(() => resetConnectionState()).not.toThrow();
    });

    it('connectToPostgres returns a connected client', async () => {
        const client = await connectToPostgres(pgConfig);
        expect(connect).toHaveBeenCalledTimes(1);
        expect(client).toMatchObject({ query });
    });

    it('connectToPostgres reports client error events', async () => {
        await connectToPostgres(pgConfig);
        const handler = on.mock.calls.find(([event]) => event === 'error')?.[1] as (e: Error) => void;

        handler(new Error('socket died'));
        expect(reportErrorMock).toHaveBeenCalledTimes(1);
    });

    it('disconnectPostgres closes the client and swallows end() failures', async () => {
        const client = await connectToPostgres(pgConfig);
        end.mockRejectedValueOnce(new Error('teardown failed'));

        await expect(disconnectPostgres(client)).resolves.toBeUndefined();
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('disconnectPostgres tolerates being called with nothing', async () => {
        await expect(disconnectPostgres()).resolves.toBeUndefined();
    });
});

describe('withDbClient inherited session state', () => {
    it('discards inherited session state before running the callback', async () => {
        const fn = vi.fn(async () => {
            expect(query).toHaveBeenCalledWith('discard all');
            return 'ok';
        });
        await expect(withDbClient(pgConfig, fn)).resolves.toBe('ok');
        expect(query).toHaveBeenCalledWith('discard all');
    });

    it('falls back to `reset role` when `discard all` is rejected by the pooler', async () => {
        query.mockRejectedValueOnce(new Error('DISCARD ALL cannot run inside a transaction block'));
        await withDbClient(pgConfig, vi.fn().mockResolvedValue(undefined));
        expect(query).toHaveBeenNthCalledWith(1, 'discard all');
        expect(query).toHaveBeenNthCalledWith(2, 'reset role');
    });

    it('still runs the callback when both resets fail', async () => {
        query.mockRejectedValueOnce(new Error('nope')).mockRejectedValueOnce(new Error('nope'));
        const fn = vi.fn().mockResolvedValue('ran');
        await expect(withDbClient(pgConfig, fn)).resolves.toBe('ran');
        expect(fn).toHaveBeenCalled();
    });

    it('does not report a failed reset as a connect error', async () => {
        query.mockRejectedValueOnce(new Error('nope')).mockRejectedValueOnce(new Error('nope'));
        await withDbClient(pgConfig, vi.fn().mockResolvedValue(undefined));
        expect(reportErrorMock).not.toHaveBeenCalled();
    });

    it('closes the client even when the resets fail', async () => {
        query.mockRejectedValueOnce(new Error('nope')).mockRejectedValueOnce(new Error('nope'));
        await withDbClient(pgConfig, vi.fn().mockResolvedValue(undefined));
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('discards inherited session state in connectToPostgres too', async () => {
        await connectToPostgres(pgConfig);
        expect(query).toHaveBeenCalledWith('discard all');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { connect, end, query, ClientMock, reportErrorMock } = vi.hoisted(() => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const end = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const ClientMock = vi.fn(() => ({ connect, end, query }));
    const reportErrorMock = vi.fn().mockResolvedValue(undefined);
    return { connect, end, query, ClientMock, reportErrorMock };
});
vi.mock('pg', () => ({ Client: ClientMock }));
vi.mock('../error_handling/report_error', () => ({ default: reportErrorMock }));

import connectToPostgres, { disconnectPostgres, resetConnectionState } from './connection';

const baseConfig = { locales: ['en'] as const, defaultLocale: 'en' };

beforeEach(() => {
    resetConnectionState();
    ClientMock.mockClear();
    end.mockClear();
    reportErrorMock.mockClear();
});

describe('connectToPostgres', () => {
    it('throws when db config is missing', async () => {
        await expect(connectToPostgres({ ...baseConfig } as never)).rejects.toThrow(/`db` is not set/);
    });

    it('throws when no connectionString resolves', async () => {
        const config = { ...baseConfig, db: {} } as never;
        await expect(connectToPostgres(config)).rejects.toThrow(/connection string/i);
    });

    it('reuses one client across concurrent callers', async () => {
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        const [a, b] = await Promise.all([connectToPostgres(config), connectToPostgres(config)]);
        expect(a).toBe(b);
        expect(ClientMock).toHaveBeenCalledTimes(1);
    });

    it('resolves a connectionString given as an async function', async () => {
        const connectionString = vi.fn().mockResolvedValue('postgresql://hyperdrive');
        const config = { ...baseConfig, db: { connectionString } } as never;
        await connectToPostgres(config);
        expect(ClientMock).toHaveBeenCalledWith({ connectionString: 'postgresql://hyperdrive' });
    });

    it('resolves a connectionString given as a sync function', async () => {
        const config = { ...baseConfig, db: { connectionString: () => 'postgresql://sync' } } as never;
        await connectToPostgres(config);
        expect(ClientMock).toHaveBeenCalledWith({ connectionString: 'postgresql://sync' });
    });

    it('throws pointing at connectionString when a resolver returns nothing', async () => {
        const config = { ...baseConfig, db: { connectionString: () => undefined } } as never;
        await expect(connectToPostgres(config)).rejects.toThrow(/`db.connectionString`/);
    });

    it('retries instead of caching a failed connect forever', async () => {
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        connect.mockRejectedValueOnce(new Error('connect refused'));
        await expect(connectToPostgres(config)).rejects.toThrow('connect refused');

        connect.mockResolvedValueOnce(undefined);
        const client = await connectToPostgres(config);
        expect(client).toBeTruthy();
        expect(ClientMock).toHaveBeenCalledTimes(2);
    });

    it('serializes concurrent queries through the client so they run one at a time', async () => {
        const order: string[] = [];
        query.mockImplementation(async (arg: string) => {
            order.push(`start:${arg}`);
            await Promise.resolve();
            order.push(`end:${arg}`);
            return { rows: [] };
        });
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        const c = await connectToPostgres(config);
        await Promise.all([c.query('a' as never), c.query('b' as never)]);
        expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
        query.mockResolvedValue({ rows: [] });
    });

    it('serializes queries even when one rejects', async () => {
        query.mockRejectedValueOnce(new Error('boom'));
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        const c = await connectToPostgres(config);
        await expect(c.query('a' as never)).rejects.toThrow('boom');
        await expect(c.query('b' as never)).resolves.toEqual({ rows: [] });
        query.mockResolvedValue({ rows: [] });
    });

    it('leaves the client as-is when it has no query function to wrap', async () => {
        ClientMock.mockImplementationOnce(() => ({ connect, end }) as never);
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        const c = await connectToPostgres(config);
        expect((c as unknown as { query?: unknown }).query).toBeUndefined();
    });
});

describe('disconnectPostgres', () => {
    it('closes the client when the last caller finishes', async () => {
        const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
        const getCloudflareContext = vi.fn().mockResolvedValue({ env: {}, ctx: { waitUntil } });
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x' },
            generate: { getCloudflareContext },
        } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
    });

    it('keeps the client open while another caller is still active', async () => {
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        await connectToPostgres(config);
        await connectToPostgres(config);
        disconnectPostgres(config);
        expect(end).not.toHaveBeenCalled();
    });

    it('does nothing when disconnectAfterRequest is false', async () => {
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x', disconnectAfterRequest: false },
        } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        expect(end).not.toHaveBeenCalled();
    });

    it('does nothing when db config is missing', () => {
        expect(() => disconnectPostgres({ ...baseConfig } as never)).not.toThrow();
        expect(end).not.toHaveBeenCalled();
    });

    it('closes the client without a Cloudflare context (no waitUntil available)', async () => {
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
    });

    it('awaits settle directly when getCloudflareContext resolves without a waitUntil function', async () => {
        const getCloudflareContext = vi.fn().mockResolvedValue({ env: {}, ctx: {} });
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x' },
            generate: { getCloudflareContext },
        } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
    });

    it('reports the error via reportError when closing the client fails', async () => {
        const closeError = new Error('close failed');
        end.mockRejectedValueOnce(closeError);
        const errorHandling = { onError: vi.fn() };
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x', disconnectTimeoutMs: 50 },
            errorHandling,
        } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        await vi.waitFor(() => expect(reportErrorMock).toHaveBeenCalledWith(
            { errorHandling, generate: undefined },
            { error: closeError, classOrMethodName: 'db.disconnectPostgres' },
        ));
        end.mockResolvedValue(undefined);
    });

    it('reports the timeout error via reportError when client.end() never settles in time', async () => {
        end.mockImplementationOnce(() => new Promise(() => undefined));
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x', disconnectTimeoutMs: 10 },
        } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        await vi.waitFor(() => expect(reportErrorMock).toHaveBeenCalledWith(
            { errorHandling: undefined, generate: undefined },
            { error: expect.any(Error), classOrMethodName: 'db.disconnectPostgres' },
        ));
        end.mockResolvedValue(undefined);
    });

    it('still settles the disconnect (clearing disconnectionPromise) when getCloudflareContext rejects', async () => {
        const contextError = new Error('context boom');
        const getCloudflareContext = vi.fn().mockRejectedValue(contextError);
        const config = {
            ...baseConfig,
            db: { connectionString: 'postgresql://x' },
            generate: { getCloudflareContext },
        } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);

        // settle() must still run (closing the client) despite getCloudflareContext
        // rejecting, and disconnectionPromise must clear so a subsequent
        // connectToPostgres call isn't left hanging on it forever.
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
        await expect(connectToPostgres(config)).resolves.toBeDefined();
        expect(ClientMock).toHaveBeenCalledTimes(2);
    });

    it('allows a new connection to be created after the previous one finished closing', async () => {
        const config = { ...baseConfig, db: { connectionString: 'postgresql://x' } } as never;
        await connectToPostgres(config);
        disconnectPostgres(config);
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
        const client2 = await connectToPostgres(config);
        expect(client2).toBeDefined();
        expect(ClientMock).toHaveBeenCalledTimes(2);
    });
});

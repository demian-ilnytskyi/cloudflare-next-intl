import type * as Pg from 'pg';
import type { Client } from 'pg';
import type { DbRoutingConfig, LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
import reportError from '../error_handling/report_error';
import requireDbConfig from './require_config';
import resolveConfigValue from './resolve_config_value';

export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;

let pgModule: Promise<typeof Pg> | undefined;

/**
 * Loads `pg` lazily, so an app that never touches the Postgres transport never
 * bundles it, and caches the module promise so concurrent callers share one
 * resolution instead of racing separate `import()` calls.
 */
function loadPg(): Promise<typeof Pg> {
    pgModule ??= import('pg');
    return pgModule;
}

async function resolveConnectionString(db: DbRoutingConfig): Promise<string> {
    const configured = await resolveConfigValue(db.connectionString);
    if (configured) return configured;
    throw new Error(
        'db: could not resolve a Postgres connection string. Set `db.connectionString` ' +
        'to a connection string, or to a function returning one (e.g. reading a ' +
        'Hyperdrive binding off `getCloudflareContext().env`).',
    );
}

/**
 * Runs `queryFn` on a Postgres client scoped to this single call: one
 * `connect()`, your callback, then a guaranteed `end()`. Each call gets its own
 * client, so concurrent renders in the same isolate can never share session
 * state (role, `request.jwt.claims`, an open transaction) with each other.
 * Hyperdrive pools the server-side connection behind this.
 */
export async function withDbClient<T>(
    config: DbConfig,
    queryFn: (client: Client) => Promise<T>
): Promise<T> {
    const db = config.db;
    requireDbConfig(db);

    const connectionString = await resolveConnectionString(db);

    const { Client: PgClient } = await loadPg();
    const client = new PgClient({ connectionString });
    let result: T;
    let connected = false;

    try {
        try {
            await client.connect();
            connected = true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? '');
            if (!/(connection terminated|connection closed|socket closed|unexpected eof)/i.test(message)) {
                void reportError(
                    { errorHandling: config.errorHandling, generate: config.generate },
                    { error, classOrMethodName: 'db.withDbClient.connectError' }
                );
            }
            throw error;
        }

        result = await queryFn(client);
    } finally {
        const endPromise = connected ? client.end() : Promise.resolve();

        const getContext = config.generate?.getCloudflareContext;
        if (!getContext || db.disconnectAfterRequest === false) {
             await endPromise.catch(() => undefined);
        } else {
            try {
                const context = await getContext({ async: true });
                if (typeof context?.ctx?.waitUntil === 'function') {
                    context.ctx.waitUntil(endPromise.catch(() => undefined));
                } else {
                    await endPromise.catch(() => undefined);
                }
            } catch {
                await endPromise.catch(() => undefined);
            }
        }
    }

    return result;
}

/**
 * No-op kept for backward compatibility. There is no cached connection state
 * to reset now that every {@link withDbClient} call owns its client.
 *
 * @deprecated Connection state is per-call; this does nothing.
 */
export function resetConnectionState(): void {
    // no cached state to reset
}

/**
 * Runs `fn` directly. Kept for backward compatibility: session state can no
 * longer leak between callers, so there is nothing left to serialize.
 *
 * @deprecated Clients are per-call now; no lock is needed.
 */
export async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
    return await fn();
}

/**
 * Opens a Postgres client the caller owns and must close with
 * {@link disconnectPostgres}. Prefer {@link withDbClient}, which closes the
 * client for you even when the callback throws.
 *
 * @deprecated Use {@link withDbClient} instead.
 */
export async function connectToPostgres(config: DbConfig): Promise<Client> {
    const db = config.db;
    requireDbConfig(db);
    const connectionString = await resolveConnectionString(db);
    const { Client: PgClient } = await loadPg();
    const client = new PgClient({ connectionString });
    client.on('error', (error) => {
        void reportError(
            { errorHandling: config.errorHandling, generate: config.generate },
            { error, classOrMethodName: 'db.connectToPostgres.clientError' }
        );
    });
    await client.connect();
    return client;
}

/**
 * Closes a client from {@link connectToPostgres}.
 *
 * @deprecated Use {@link withDbClient} instead.
 */
export async function disconnectPostgres(client?: Client): Promise<void> {
    await client?.end().catch(() => undefined);
}
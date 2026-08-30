import type * as Pg from 'pg';
import type { Client } from 'pg';
import type { DbRoutingConfig, ErrorHandlingRoutingConfig, FirebaseAuthRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
import reportError from '../error_handling/report_error.js';
import requireDbConfig from './require_config.js';
import resolveConfigValue from './resolve_config_value.js';
import { resolveEnv } from '../server/functions/geo.js';

/**
 * The slice of `RoutingConfig` every `db` export actually reads — deliberately
 * missing `locales`/`defaultLocale` so a standalone (non-Next.js) caller via
 * `cloudflare-next-intl/db/standalone` can pass this directly, without the
 * i18n fields a plain TypeScript project has no use for.
 */
export interface DbConfig {
    db?: DbRoutingConfig;
    firebaseAuth?: FirebaseAuthRoutingConfig;
    generate?: GenerateRoutingConfig;
    errorHandling?: ErrorHandlingRoutingConfig;
}

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

async function resolveConnectionString(db: DbRoutingConfig, generate?: GenerateRoutingConfig): Promise<string> {
    const configured = await resolveConfigValue(db.connectionString);
    if (configured) return configured;

    const env = await resolveEnv(generate);
    const hyperdriveConn = (env?.HYPERDRIVE as { connectionString?: string } | undefined)?.connectionString;
    if (hyperdriveConn && hyperdriveConn !== 'postgresql://user:pass@localhost:5432/db') {
        return hyperdriveConn;
    }

    throw new Error(
        'db: could not resolve a Postgres connection string. Set `db.connectionString` ' +
        'to a connection string, or to a function returning one (e.g. reading a ' +
        'Hyperdrive binding off `env` or `getCloudflareContext().env`).',
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

    const connectionString = await resolveConnectionString(db, config.generate);

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

        let ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
        if (db.disconnectAfterRequest !== false) {
            if (config.generate?.ctx) {
                ctx = typeof config.generate.ctx === 'function' ? config.generate.ctx() : config.generate.ctx;
            } else if (config.generate?.getCloudflareContext) {
                try {
                    const context = await config.generate.getCloudflareContext({ async: true });
                    ctx = context?.ctx;
                } catch {
                    // Ignore context resolution errors
                }
            }
        }

        if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(endPromise.catch(() => undefined));
        } else {
            await endPromise.catch(() => undefined);
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
    const connectionString = await resolveConnectionString(db, config.generate);
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
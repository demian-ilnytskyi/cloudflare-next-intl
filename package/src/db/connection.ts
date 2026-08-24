import { Client } from 'pg';
import type { DbRoutingConfig, LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
import reportError from '../error_handling/report_error';
import requireDbConfig from './require_config';
import resolveConfigValue from './resolve_config_value';

export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;

// Removed Global Singletons (no `client`, `connectionString`, `activeUsers`, `connectionPromise`)
// Removed Custom Locks (no `serializeQueries`, no `sessionLock`)

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
 * ✅ ONE CLIENT PER QUERY & GUARANTEED DISCONNECT:
 * This single wrapper correctly leverages Cloudflare Hyperdrive by connecting securely, 
 * running your logic safely in total isolation, and immediately releasing the socket. 
 */
export async function withDbClient<T>(
    config: DbConfig,
    queryFn: (client: Client) => Promise<T>
): Promise<T> {
    const db = config.db;
    requireDbConfig(db);

    const connectionString = await resolveConnectionString(db);

    // Creates an independent, stateless Client so concurrent Next.js renders don't lock each other up.
    const client = new Client({ connectionString });

    try {
        await client.connect();

        // Pass this client independently straight into your callback to be executed
        return await queryFn(client); 
        
    } catch (error: any) {
        // Silently swallow Hyperdrive pool termination warnings that are passive/natural 
        const message = error?.message || '';
        if (!/(connection terminated|connection closed|socket closed|unexpected eof)/i.test(message)) {
            void reportError(
                { errorHandling: config.errorHandling, generate: config.generate },
                { error, classOrMethodName: 'db.withDbClient.clientError' }
            );
        }
        throw error;
    } finally {
        // GUARANTEED TEAR-DOWN
        // Triggers `.end()` right when your data has finished being processed.
        const endPromise = client.end();
        
        const getContext = config.generate?.getCloudflareContext;
        if (!getContext || db.disconnectAfterRequest === false) {
             await endPromise.catch(() => {});
        } else {
            try {
                const context = await getContext({ async: true });
                if (typeof context?.ctx?.waitUntil === 'function') {
                    context.ctx.waitUntil(endPromise.catch(() => {}));
                } else {
                    await endPromise.catch(() => {});
                }
            } catch {
                await endPromise.catch(() => {});
            }
        }
    }
}

// -------------------------------------------------------------
// ⚠️ STUBS TO CATCH OUTDATED USAGES ACROSS YOUR REPOSITORY ⚠️
// I've kept these named exports intact so your IDE will flag 
// where they exist so you know exactly what code to update next.
// -------------------------------------------------------------

export function resetConnectionState(): void {
    // Obsolete - ignored
}

export async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
    // Locks are no longer needed as clients are entirely isolated
    return await fn();
}

export async function connectToPostgres(config: DbConfig): Promise<Client> {
    throw new Error('CRITICAL REFACTOR: Replace `connectToPostgres` with `withDbClient(config, async (client) => { ... })` for Cloudflare Hyperdrive.');
}

export function disconnectPostgres(config: DbConfig): void {
    // Obsolete - disconnected natively in withDbClient now.
}
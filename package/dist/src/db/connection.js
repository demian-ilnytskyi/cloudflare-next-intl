import reportError from '../error_handling/report_error.js';
import requireDbConfig from './require_config.js';
import resolveConfigValue from './resolve_config_value.js';
import { resolveEnv } from '../server/functions/geo.js';
let pgModule;
function loadPg() {
    pgModule ?? (pgModule = import('pg'));
    return pgModule;
}
async function resolveConnectionString(db, generate) {
    const configured = await resolveConfigValue(db.connectionString);
    if (configured)
        return configured;
    const env = await resolveEnv(generate);
    const hyperdriveConn = env?.HYPERDRIVE?.connectionString;
    if (hyperdriveConn && hyperdriveConn !== 'postgresql://user:pass@localhost:5432/db') {
        return hyperdriveConn;
    }
    throw new Error('db: could not resolve a Postgres connection string. Set `db.connectionString` ' +
        'to a connection string, or to a function returning one (e.g. reading a ' +
        'Hyperdrive binding off `env` or `getCloudflareContext().env`).');
}
export async function withDbClient(config, queryFn) {
    const db = config.db;
    requireDbConfig(db);
    const connectionString = await resolveConnectionString(db, config.generate);
    const { Client: PgClient } = await loadPg();
    const client = new PgClient({ connectionString });
    let result;
    let connected = false;
    try {
        try {
            await client.connect();
            connected = true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? '');
            if (!/(connection terminated|connection closed|socket closed|unexpected eof)/i.test(message)) {
                void reportError({ errorHandling: config.errorHandling, generate: config.generate }, { error, classOrMethodName: 'db.withDbClient.connectError' });
            }
            throw error;
        }
        result = await queryFn(client);
    }
    finally {
        const endPromise = connected ? client.end() : Promise.resolve();
        let ctx;
        if (db.disconnectAfterRequest !== false) {
            if (config.generate?.ctx) {
                ctx = typeof config.generate.ctx === 'function' ? config.generate.ctx() : config.generate.ctx;
            }
            else if (config.generate?.getCloudflareContext) {
                try {
                    const context = await config.generate.getCloudflareContext({ async: true });
                    ctx = context?.ctx;
                }
                catch {
                }
            }
        }
        if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(endPromise.catch(() => undefined));
        }
        else {
            await endPromise.catch(() => undefined);
        }
    }
    return result;
}
export function resetConnectionState() {
}
export async function withSessionLock(fn) {
    return await fn();
}
export async function connectToPostgres(config) {
    const db = config.db;
    requireDbConfig(db);
    const connectionString = await resolveConnectionString(db, config.generate);
    const { Client: PgClient } = await loadPg();
    const client = new PgClient({ connectionString });
    client.on('error', (error) => {
        void reportError({ errorHandling: config.errorHandling, generate: config.generate }, { error, classOrMethodName: 'db.connectToPostgres.clientError' });
    });
    await client.connect();
    return client;
}
export async function disconnectPostgres(client) {
    await client?.end().catch(() => undefined);
}

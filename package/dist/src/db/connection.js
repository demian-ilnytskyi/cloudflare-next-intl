import reportError from '../error_handling/report_error';
import requireDbConfig from './require_config';
const DEFAULT_BINDING = 'HYPERDRIVE';
const DEFAULT_DISCONNECT_TIMEOUT_MS = 2000;
let connectionString = null;
let client = null;
let connectionPromise = null;
let connectingPromise = null;
let disconnectionPromise = null;
let activeUsers = 0;
/** Clears the cached client/connection string. Call after changing `db` config, or between tests. */
export function resetConnectionState() {
    connectionString = null;
    client = null;
    connectionPromise = null;
    connectingPromise = null;
    disconnectionPromise = null;
    activeUsers = 0;
}
async function resolveConnectionString(config, db) {
    if (db.connectionString)
        return db.connectionString;
    const getContext = config.generate?.getCloudflareContext;
    if (getContext) {
        const context = await getContext({ async: true });
        const env = context?.env;
        const binding = env?.[db.hyperdriveBinding ?? DEFAULT_BINDING];
        if (binding?.connectionString)
            return binding.connectionString;
    }
    throw new Error('db: could not resolve a Postgres connection string. Set `db.connectionString`, or ' +
        `configure \`generate.getCloudflareContext\` and a \`${db.hyperdriveBinding ?? DEFAULT_BINDING}\` ` +
        'Hyperdrive binding on your Worker.');
}
// A single `pg.Client` is not safe for concurrent queries; Next.js fires many
// in parallel per request. Serializing every `query` through one promise chain
// keeps one connection correct instead of paying for a pool on top of
// Hyperdrive's own pooling.
function serializeQueries(raw) {
    const originalQuery = raw.query;
    if (typeof originalQuery !== 'function')
        return raw;
    let last = Promise.resolve();
    raw.query = (...args) => {
        const run = () => originalQuery.apply(raw, args);
        const next = last.then(run, run);
        last = next.catch(() => undefined);
        return next;
    };
    return raw;
}
/** Returns the request's shared, connected client, creating it on first use. */
export default async function connectToPostgres(config) {
    const db = config.db;
    requireDbConfig(db);
    await disconnectionPromise;
    if (connectingPromise === null) {
        connectingPromise = (async () => {
            try {
                connectionString ?? (connectionString = await resolveConnectionString(config, db));
                const { Client } = await import('pg');
                const created = serializeQueries(new Client({ connectionString }));
                client = created;
                connectionPromise = created.connect();
                await connectionPromise;
                return created;
            }
            catch (error) {
                // A failed connect must not be cached forever — clear state so the
                // next call retries instead of replaying the same rejection for the
                // life of the Worker isolate.
                connectingPromise = null;
                connectionString = null;
                client = null;
                connectionPromise = null;
                throw error;
            }
        })();
    }
    activeUsers++;
    return connectingPromise;
}
/** Releases one caller's hold on the client, closing it when the last one finishes. */
export function disconnectPostgres(config) {
    const db = config.db;
    if (!db || db.disconnectAfterRequest === false)
        return;
    activeUsers = Math.max(0, activeUsers - 1);
    if (!client || activeUsers !== 0)
        return;
    const closing = client;
    // Null out synchronously so a concurrent request creates a fresh client
    // instead of reusing one that is about to close.
    client = null;
    connectionPromise = null;
    connectingPromise = null;
    const endPromise = closing.end();
    disconnectionPromise = endPromise;
    const timeoutMs = db.disconnectTimeoutMs ?? DEFAULT_DISCONNECT_TIMEOUT_MS;
    const settle = async () => {
        try {
            await Promise.race([
                endPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout closing postgres client')), timeoutMs)),
            ]);
        }
        catch (error) {
            await reportError({ errorHandling: config.errorHandling, generate: config.generate }, { error, classOrMethodName: 'db.disconnectPostgres' });
        }
        finally {
            if (disconnectionPromise === endPromise)
                disconnectionPromise = null;
        }
    };
    const getContext = config.generate?.getCloudflareContext;
    if (!getContext) {
        void settle();
        return;
    }
    void (async () => {
        // No matter what happens resolving the context/waitUntil below,
        // settle() must always run — it's the only place disconnectionPromise
        // gets cleared, and connectToPostgres awaits that promise on every
        // call. A rejected/throwing getContext must still fall through to
        // settle() directly instead of leaving the disconnect stuck forever.
        let waitUntil;
        try {
            const context = await getContext({ async: true });
            if (typeof context?.ctx?.waitUntil === 'function') {
                waitUntil = context.ctx.waitUntil.bind(context.ctx);
            }
        }
        catch {
            waitUntil = undefined;
        }
        if (waitUntil)
            waitUntil(settle());
        else
            await settle();
    })();
}

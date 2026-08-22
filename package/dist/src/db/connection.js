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
/**
 * Forgets the cached client and connection string so the next
 * `connectToPostgres` call builds both from scratch. Intended for tests and
 * for after a `db` config change.
 *
 * This drops the reference **without closing** an open connection, so only
 * call it when no query is in flight — otherwise use `disconnectPostgres`,
 * which closes the client properly.
 */
export function resetConnectionState() {
    connectionString = null;
    client = null;
    connectionPromise = null;
    connectingPromise = null;
    disconnectionPromise = null;
    activeUsers = 0;
}
/**
 * Resolves the connection string from `db.connectionString` first, then the
 * Cloudflare Hyperdrive binding named by `db.hyperdriveBinding`.
 */
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
/**
 * Returns the request's shared, already-connected Postgres client, creating it
 * on first use and reusing it for every later caller in the same request.
 *
 * Prefer `withPublicDb`/`withUserDb`, which call this for you and always
 * release the connection. Reach for this directly only when you need the raw
 * `pg` client — and then every call **must** be paired with a
 * `disconnectPostgres` call, or the connection is never released.
 *
 * @param config Your routing config; `config.db` must be set.
 * @returns The connected, shared client.
 * @throws If `db` is not set, or no connection string can be resolved from
 * `db.connectionString` or the Hyperdrive binding.
 */
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
/**
 * Releases one caller's hold on the shared client, closing it once the last
 * holder of the request is done. Call it exactly once per
 * `connectToPostgres` call.
 *
 * Returns immediately and finishes closing in the background (via
 * `ctx.waitUntil` when a Cloudflare context is available), so it never delays
 * the response. Closing errors are reported through `errorHandling`, not
 * thrown. Does nothing when `db.disconnectAfterRequest` is `false`, which
 * keeps the connection open for the life of the isolate.
 *
 * @param config Your routing config; safe to call when `config.db` is unset.
 */
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

import type { Client } from 'pg';
import type { DbRoutingConfig, LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
import reportError from '../error_handling/report_error';
import requireDbConfig from './require_config';
import resolveConfigValue from './resolve_config_value';

export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;

const DEFAULT_DISCONNECT_TIMEOUT_MS = 2000;

let connectionString: string | null = null;
let client: Client | null = null;
let connectionPromise: Promise<Client> | null = null;
let disconnectionPromise: Promise<void> | null = null;
let activeUsers = 0;
let sessionLock: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` exclusively against the shared client: no other
 * `withSessionLock` caller's queries can interleave with `fn`'s until it
 * settles. `serializeQueries` alone only orders individual `.query()` calls —
 * it does nothing to stop a *different* concurrent request's queries from
 * landing between, say, `set role`/`set_config(...)` and the query that
 * depends on it, on the one `pg.Client` every request in the isolate shares.
 * That gap let one request's role/RLS identity leak into another's queries
 * whenever two requests overlapped in the same Worker isolate — and, when
 * `withUserDb` used to wrap its call in a real `BEGIN`/`COMMIT` transaction,
 * interleaved transaction boundaries from two overlapping callers made
 * Postgres itself reject statements ("already a transaction in progress").
 * `withUserDb` no longer opens a transaction on this shared client for
 * exactly that reason (session-scoped `set role`/`set_config(..., false)`
 * need no transaction to apply) — but every caller that still depends on
 * session-scoped state on the shared client MUST run inside this lock.
 */
export async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = sessionLock;
    let release!: () => void;
    sessionLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
        return await fn();
    } finally {
        release!();
    }
}

/**
 * Forgets the cached client and connection string so the next
 * `connectToPostgres` call builds both from scratch. Intended for tests and
 * for after a `db` config change.
 *
 * This drops the reference **without closing** an open connection, so only
 * call it when no query is in flight — otherwise use `disconnectPostgres`,
 * which closes the client properly.
 */
export function resetConnectionState(): void {
    connectionString = null;
    client = null;
    connectionPromise = null;
    disconnectionPromise = null;
    activeUsers = 0;
    sessionLock = Promise.resolve();
}

/**
 * Resolves the connection string from `db.connectionString`, awaiting it when
 * it was given as a function.
 */
async function resolveConnectionString(db: DbRoutingConfig): Promise<string> {
    const configured = await resolveConfigValue(db.connectionString);
    if (configured) return configured;
    throw new Error(
        'db: could not resolve a Postgres connection string. Set `db.connectionString` ' +
        'to a connection string, or to a function returning one (e.g. reading a ' +
        'Hyperdrive binding off `getCloudflareContext().env`).',
    );
}

// A single `pg.Client` is not safe for concurrent queries; Next.js fires many
// in parallel per request. Serializing every `query` through one promise chain
// keeps one connection correct instead of paying for a pool on top of
// Hyperdrive's own pooling.
function serializeQueries(raw: Client): Client {
    const originalQuery = raw.query;
    if (typeof originalQuery !== 'function') return raw;
    let last: Promise<unknown> = Promise.resolve();
    (raw as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = (...args: unknown[]) => {
        const run = () => (originalQuery as (...a: unknown[]) => Promise<unknown>).apply(raw, args);
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
 * @param resolved A connection string already resolved by the caller (e.g.
 * `resolveDbMode`, which has to call `db.connectionString` itself to decide
 * the transport) — pass it to skip resolving `db.connectionString` a second
 * time. Omit it to have this function resolve it itself, as before.
 * @returns The connected, shared client.
 * @throws If `db` is not set, or no connection string can be resolved from
 * `db.connectionString`.
 */
export default async function connectToPostgres(config: DbConfig, resolved?: string | undefined): Promise<Client> {
    const db = config.db;
    requireDbConfig(db);
    await disconnectionPromise;

    // Guards the race between concurrent callers that both see `client ===
    // null` before either has awaited anything: `connectionPromise` is set
    // synchronously (before the `await`s below) so every caller in the same
    // microtask tick shares the one client being created instead of each
    // starting its own.
    if (connectionPromise === null) {
        connectionPromise = (async () => {
            connectionString = resolved ?? await resolveConnectionString(db);
            const { Client } = await import('pg');
            const created = serializeQueries(new Client({ connectionString }));
            // The shared client outlives a single request (see the module doc)
            // and Hyperdrive/Postgres can close its idle socket at any time. `pg`
            // surfaces that as an `'error'` event on the `Client`, which is an
            // `EventEmitter` — with no listener, Node treats it as unhandled and
            // throws, crashing whatever unrelated request happens to be running
            // in the isolate at that moment. Listening here converts it into a
            // clean reset so the next call reconnects instead.
            created.on('error', (error: Error) => {
                if (client === created) {
                    client = null;
                    connectionString = null;
                    connectionPromise = null;
                }
                // `pg` emits "Connection terminated"/"Connection terminated
                // unexpectedly" (lib/client.js) — never "Connection closed" —
                // when the idle socket dies outside a query. That's the
                // expected shape of this event (Hyperdrive/Postgres recycling
                // the connection, not a query failure): swallow it entirely,
                // don't report or log it.
                if (/connection terminated/i.test(error.message)) return;
                void reportError(
                    { errorHandling: config.errorHandling, generate: config.generate },
                    { error, classOrMethodName: 'db.connectToPostgres.clientError' },
                );
            });
            client = created;
            await created.connect();
            return created;
        })();
    }
    activeUsers++;
    try {
        return await connectionPromise;
    } catch (error) {
        // A failed connect must not be cached forever — clear state so the
        // next call retries instead of replaying the same rejection for the
        // life of the Worker isolate.
        activeUsers = Math.max(0, activeUsers - 1);
        connectionString = null;
        client = null;
        connectionPromise = null;
        throw error;
    }
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
export function disconnectPostgres(config: DbConfig): void {
    const db = config.db;
    if (!db || db.disconnectAfterRequest === false) return;
    activeUsers = Math.max(0, activeUsers - 1);
    if (!client || activeUsers !== 0) return;

    const closing = client;
    // Null out synchronously so a concurrent request creates a fresh client
    // instead of reusing one that is about to close.
    client = null;
    connectionPromise = null;
    const endPromise = closing.end();
    disconnectionPromise = endPromise;

    const timeoutMs = db.disconnectTimeoutMs ?? DEFAULT_DISCONNECT_TIMEOUT_MS;
    const settle = async () => {
        try {
            await Promise.race([
                endPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout closing postgres client')), timeoutMs)),
            ]);
        } catch (error) {
            await reportError(
                { errorHandling: config.errorHandling, generate: config.generate },
                { error, classOrMethodName: 'db.disconnectPostgres' },
            );
        } finally {
            if (disconnectionPromise === endPromise) disconnectionPromise = null;
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
        let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
        try {
            const context = await getContext({ async: true });
            if (typeof context?.ctx?.waitUntil === 'function') {
                waitUntil = context.ctx.waitUntil.bind(context.ctx);
            }
        } catch {
            waitUntil = undefined;
        }
        if (waitUntil) waitUntil(settle());
        else await settle();
    })();
}

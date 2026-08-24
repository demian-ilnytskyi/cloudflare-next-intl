import type { Client } from 'pg';
import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;
/**
 * Runs `fn` exclusively against the shared client: no other
 * `withSessionLock` caller's queries can interleave with `fn`'s until it
 * settles. `serializeQueries` alone only orders individual `.query()` calls —
 * it does nothing to stop a *different* concurrent request's queries from
 * landing between, say, a transaction's `BEGIN`/`SET LOCAL ROLE` and its
 * `COMMIT` on the one `pg.Client` every request in the isolate shares. That
 * gap let one request's role/RLS identity leak into another's queries
 * whenever two requests overlapped in the same Worker isolate. Every caller
 * that opens a transaction, or otherwise depends on session-scoped state
 * (`SET LOCAL`, `set_config(..., true)`), MUST run inside this lock.
 */
export declare function withSessionLock<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Forgets the cached client and connection string so the next
 * `connectToPostgres` call builds both from scratch. Intended for tests and
 * for after a `db` config change.
 *
 * This drops the reference **without closing** an open connection, so only
 * call it when no query is in flight — otherwise use `disconnectPostgres`,
 * which closes the client properly.
 */
export declare function resetConnectionState(): void;
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
export default function connectToPostgres(config: DbConfig, resolved?: string | undefined): Promise<Client>;
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
export declare function disconnectPostgres(config: DbConfig): void;

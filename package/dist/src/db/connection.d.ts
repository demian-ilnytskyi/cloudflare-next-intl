import type { Client } from 'pg';
import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;
/**
 * Runs `queryFn` on a Postgres client scoped to this single call: one
 * `connect()`, your callback, then a guaranteed `end()`. Each call gets its own
 * client, so concurrent renders in the same isolate can never share session
 * state (role, `request.jwt.claims`, an open transaction) with each other.
 * Hyperdrive pools the server-side connection behind this.
 */
export declare function withDbClient<T>(config: DbConfig, queryFn: (client: Client) => Promise<T>): Promise<T>;
/**
 * No-op kept for backward compatibility. There is no cached connection state
 * to reset now that every {@link withDbClient} call owns its client.
 *
 * @deprecated Connection state is per-call; this does nothing.
 */
export declare function resetConnectionState(): void;
/**
 * Runs `fn` directly. Kept for backward compatibility: session state can no
 * longer leak between callers, so there is nothing left to serialize.
 *
 * @deprecated Clients are per-call now; no lock is needed.
 */
export declare function withSessionLock<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Opens a Postgres client the caller owns and must close with
 * {@link disconnectPostgres}. Prefer {@link withDbClient}, which closes the
 * client for you even when the callback throws.
 *
 * @deprecated Use {@link withDbClient} instead.
 */
export declare function connectToPostgres(config: DbConfig): Promise<Client>;
/**
 * Closes a client from {@link connectToPostgres}.
 *
 * @deprecated Use {@link withDbClient} instead.
 */
export declare function disconnectPostgres(client?: Client): Promise<void>;

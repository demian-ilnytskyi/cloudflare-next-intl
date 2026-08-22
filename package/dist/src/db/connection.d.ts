import type { Client } from 'pg';
import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;
/** Clears the cached client/connection string. Call after changing `db` config, or between tests. */
export declare function resetConnectionState(): void;
/** Returns the request's shared, connected client, creating it on first use. */
export default function connectToPostgres(config: DbConfig): Promise<Client>;
/** Releases one caller's hold on the client, closing it when the last one finishes. */
export declare function disconnectPostgres(config: DbConfig): void;

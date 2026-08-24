import { Client } from 'pg';
import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';
export type DbConfig = RoutingConfig<Locales, LocalePrefixMode>;
/**
 * ✅ ONE CLIENT PER QUERY & GUARANTEED DISCONNECT:
 * This single wrapper correctly leverages Cloudflare Hyperdrive by connecting securely,
 * running your logic safely in total isolation, and immediately releasing the socket.
 */
export declare function withDbClient<T>(config: DbConfig, queryFn: (client: Client) => Promise<T>): Promise<T>;
export declare function resetConnectionState(): void;
export declare function withSessionLock<T>(fn: () => Promise<T>): Promise<T>;
export declare function connectToPostgres(config: DbConfig): Promise<Client>;
export declare function disconnectPostgres(config: DbConfig): void;

import type { Client } from 'pg';
import type { DbRoutingConfig, ErrorHandlingRoutingConfig, FirebaseAuthRoutingConfig, GenerateRoutingConfig } from '../types/types.js';
export interface DbConfig {
    db?: DbRoutingConfig;
    firebaseAuth?: FirebaseAuthRoutingConfig;
    generate?: GenerateRoutingConfig;
    errorHandling?: ErrorHandlingRoutingConfig;
}
export declare function withDbClient<T>(config: DbConfig, queryFn: (client: Client) => Promise<T>): Promise<T>;
export declare function resetConnectionState(): void;
export declare function withSessionLock<T>(fn: () => Promise<T>): Promise<T>;
export declare function connectToPostgres(config: DbConfig): Promise<Client>;
export declare function disconnectPostgres(client?: Client): Promise<void>;

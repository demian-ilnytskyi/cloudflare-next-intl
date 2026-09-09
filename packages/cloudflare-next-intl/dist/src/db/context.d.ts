import type { DbRoutingConfig, DrizzleDb, TransactionResult, UserDbCredentials } from '@cloudflare-next-intl/db';
export type { DrizzleDb, TransactionResult, UserDbCredentials };
export declare function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T>;
export declare function withUserDb<T>(fn: (db: DrizzleDb) => Promise<T>, auth?: string | null | UserDbCredentials, dbOverride?: DbRoutingConfig): Promise<T>;
export declare function resolveUserDbCredentials(dbOverride?: DbRoutingConfig): Promise<UserDbCredentials>;

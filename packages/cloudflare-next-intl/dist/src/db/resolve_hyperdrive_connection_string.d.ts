import type { GenerateRoutingConfig } from '../types/types.js';
export interface HyperdriveBindingLike {
    connectionString: string;
}
export declare function resolveHyperdriveConnectionString(generate?: GenerateRoutingConfig, skipUrls?: readonly string[]): Promise<string | undefined>;

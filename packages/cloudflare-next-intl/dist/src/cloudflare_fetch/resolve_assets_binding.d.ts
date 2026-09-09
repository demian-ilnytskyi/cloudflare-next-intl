import type { GenerateRoutingConfig } from '../types/types.js';
export interface AssetsBindingLike {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
export declare function resolveAssetsBinding(generate?: GenerateRoutingConfig): Promise<AssetsBindingLike | null>;

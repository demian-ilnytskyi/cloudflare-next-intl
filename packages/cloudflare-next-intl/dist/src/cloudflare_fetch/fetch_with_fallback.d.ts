import type { GenerateRoutingConfig } from '../types/types.js';
export declare function fetchWithCloudflareFallback(input: RequestInfo | URL, init: RequestInit, generate?: GenerateRoutingConfig): Promise<Response>;

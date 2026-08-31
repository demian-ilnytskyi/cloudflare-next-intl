import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';

export interface HyperdriveBindingLike {
    connectionString: string;
}

// `wrangler dev` fills an unconfigured `[[hyperdrive]]` binding with this
// exact placeholder rather than leaving it unset — matches
// `clarivant/CRV/src/shared/repositories/cloudflare_repository.ts`'s
// `getHyperdriveConnectString` guard. Treating it as "no connection string"
// avoids a real connection attempt against a socket nothing is listening on.
const WRANGLER_DEV_PLACEHOLDER = 'postgresql://user:pass@localhost:5432/db';

/**
 * Resolves `env.HYPERDRIVE.connectionString` via `resolveEnv()` (this
 * package's existing `generate.env` convention). Returns `undefined` — never
 * throws — when there's no `HYPERDRIVE` binding, or it's `wrangler dev`'s
 * unconfigured placeholder.
 */
export async function resolveHyperdriveConnectionString(generate?: GenerateRoutingConfig): Promise<string | undefined> {
    const env = await resolveEnv(generate);
    const binding = (env as Record<string, unknown> | undefined)?.HYPERDRIVE as HyperdriveBindingLike | undefined;
    const connectionString = binding?.connectionString;
    if (!connectionString || connectionString === WRANGLER_DEV_PLACEHOLDER) return undefined;
    return connectionString;
}

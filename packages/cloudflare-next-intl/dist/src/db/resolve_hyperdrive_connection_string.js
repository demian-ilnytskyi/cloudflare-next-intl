import { resolveEnv } from '../server/functions/geo.js';
const WRANGLER_DEV_PLACEHOLDER = 'postgresql://user:pass@localhost:5432/db';
const DEFAULT_SKIP_URLS = [WRANGLER_DEV_PLACEHOLDER];
export async function resolveHyperdriveConnectionString(generate, skipUrls = DEFAULT_SKIP_URLS) {
    const env = await resolveEnv(generate);
    const binding = env?.HYPERDRIVE;
    const connectionString = binding?.connectionString;
    if (!connectionString || skipUrls.includes(connectionString))
        return undefined;
    return connectionString;
}

import { resolveEnv } from '../server/functions/geo.js';
export async function resolveAssetsBinding(generate) {
    const env = await resolveEnv(generate);
    const candidate = env?.ASSETS;
    if (!candidate || typeof candidate !== 'object')
        return null;
    const fetchFn = candidate.fetch;
    return typeof fetchFn === 'function' ? candidate : null;
}

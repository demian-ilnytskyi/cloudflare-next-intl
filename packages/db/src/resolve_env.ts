import memoizeByRef from './memoize_by_ref.js';
import type { GenerateRoutingConfig } from './types.js';

/**
 * Resolves the Cloudflare environment bindings object from `generate.env`
 * or `generate.getCloudflareContext`. Local copy of
 * `cloudflare-next-intl`'s `server/functions/geo.ts#resolveEnv`, trimmed to
 * just what {@link resolveHyperdriveConnectionString} needs — this package
 * has no `@intl-config` fallback to also try, and memoizes with
 * {@link memoizeByRef} instead of React's `cache()` so it works outside a
 * React render (Deno, a plain Node script, a Cloudflare Worker with no
 * React in it at all).
 */
async function resolveEnvUncached(
    generate: GenerateRoutingConfig,
): Promise<Record<string, unknown> | undefined> {
    if (generate.env) {
        const resolved = typeof generate.env === 'function' ? await generate.env() : generate.env;
        return resolved as Record<string, unknown>;
    }
    if (generate.getCloudflareContext) {
        try {
            const ctx = await generate.getCloudflareContext({ async: true });
            return ctx?.env;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

const resolveEnvMemoized = memoizeByRef(
    async (generate: GenerateRoutingConfig) => resolveEnvUncached(generate),
);

export default async function resolveEnv(
    generate?: GenerateRoutingConfig,
): Promise<Record<string, unknown> | undefined> {
    if (!generate) return undefined;
    return resolveEnvMemoized(generate);
}

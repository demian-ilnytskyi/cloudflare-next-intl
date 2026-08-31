import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/**
 * Duck-typed Cloudflare Assets Service binding (`wrangler.toml`'s
 * `[assets] binding = "ASSETS"`, or any binding shaped like it) — no
 * `@cloudflare/workers-types` dependency, matching how
 * `portfolio/src/shared/error_handling/transactional_email.ts` types its
 * own Cloudflare binding locally.
 */
export interface AssetsBindingLike {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Resolves `env.ASSETS` via `resolveEnv()` (this package's existing
 * `generate.env`/`generate.getCloudflareContext` resolution, already used
 * by `getCountry`/`getTimezone`) and returns it only if it looks callable.
 * Returns `null` — never throws — when no binding is configured, which is
 * the normal case in `next dev`/a plain Vite dev server/Node.
 */
export async function resolveAssetsBinding(generate?: GenerateRoutingConfig): Promise<AssetsBindingLike | null> {
    const env = await resolveEnv(generate);
    const candidate = (env as Record<string, unknown> | undefined)?.ASSETS;
    if (!candidate || typeof candidate !== 'object') return null;
    const fetchFn = (candidate as { fetch?: unknown }).fetch;
    return typeof fetchFn === 'function' ? (candidate as AssetsBindingLike) : null;
}

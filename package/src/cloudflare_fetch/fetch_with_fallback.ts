import { resolveAssetsBinding } from './resolve_assets_binding.js';
import type { GenerateRoutingConfig } from '../types/types.js';

/**
 * Fetches `input` via the Cloudflare Assets binding when one resolves
 * (`resolveAssetsBinding`), otherwise via the global `fetch` with
 * `cache: 'no-store'` — the same two-path shape as
 * `portfolio/src/shared/repositories/site_fetch_repository.ts`'s
 * `fetchTextData`, generalized to resolve the binding through this
 * package's own `generate.env` convention (so it works under Vite too,
 * not just `next-on-pages`/OpenNext) instead of branching on
 * `KTextConstants.isDev`.
 */
export async function fetchWithCloudflareFallback(
    input: RequestInfo | URL,
    init: RequestInit,
    generate?: GenerateRoutingConfig,
): Promise<Response> {
    const binding = await resolveAssetsBinding(generate);
    if (binding) return binding.fetch(input, init);
    return fetch(input, { ...init, cache: 'no-store' });
}

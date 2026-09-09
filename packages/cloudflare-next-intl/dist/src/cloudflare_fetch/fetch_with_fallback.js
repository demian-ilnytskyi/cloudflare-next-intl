import { resolveAssetsBinding } from './resolve_assets_binding.js';
export async function fetchWithCloudflareFallback(input, init, generate) {
    const binding = await resolveAssetsBinding(generate);
    if (binding)
        return binding.fetch(input, init);
    return fetch(input, { ...init, cache: 'no-store' });
}

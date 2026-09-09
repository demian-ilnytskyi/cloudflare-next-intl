import { resolveEnv } from '../server/functions/geo.js';
export async function resolveEmailBinding(generate, bindingName = 'EMAIL') {
    const env = await resolveEnv(generate);
    const candidate = env?.[bindingName];
    if (!candidate || typeof candidate !== 'object')
        return null;
    return typeof candidate.send === 'function' ? candidate : null;
}

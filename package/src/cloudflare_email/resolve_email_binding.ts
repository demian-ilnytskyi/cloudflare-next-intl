import { resolveEnv } from '../server/functions/geo.js';
import type { GenerateRoutingConfig } from '../types/types.js';

export interface EmailBindingLike {
    send(message: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<unknown>;
}

/**
 * Resolves the Cloudflare Email Sending binding (`wrangler.toml`'s
 * `[[send_email]]`, default binding name `EMAIL`) via `resolveEnv()`. Returns
 * `null` — never throws — when unavailable, e.g. `next dev`/a plain Vite dev
 * server with no Worker bindings.
 */
export async function resolveEmailBinding(generate?: GenerateRoutingConfig, bindingName = 'EMAIL'): Promise<EmailBindingLike | null> {
    const env = await resolveEnv(generate);
    const candidate = (env as Record<string, unknown> | undefined)?.[bindingName];
    if (!candidate || typeof candidate !== 'object') return null;
    return typeof (candidate as EmailBindingLike).send === 'function' ? (candidate as EmailBindingLike) : null;
}

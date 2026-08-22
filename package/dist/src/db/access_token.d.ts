import type { DbConfig } from './connection';
/**
 * Resolves the JWT that identifies the caller to Supabase, trying
 * `db.getAccessToken()` first, then the signed-in Firebase user's ID token.
 *
 * PostgREST reads this token to pick the caller's role and populate
 * `request.jwt.claims`, which is what makes RLS behave the same as it does in
 * connection-string mode.
 *
 * @param config Your routing config; `config.db` must be set.
 * @returns The bearer token to send with the request.
 * @throws If `db` is not set, or no token can be resolved.
 */
export default function resolveAccessToken(config: DbConfig): Promise<string>;

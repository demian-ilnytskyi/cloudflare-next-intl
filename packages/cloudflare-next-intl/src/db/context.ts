import type { DbRoutingConfig, DrizzleDb, TransactionResult, UserDbCredentials } from 'cloudflare-next-intl-db';
import {
    withPublicDb as withPublicDbImpl,
    withUserDb as withUserDbImpl,
    withServiceDb as withServiceDbImpl,
    resolveUserDbCredentials as resolveUserDbCredentialsImpl,
} from 'cloudflare-next-intl-db';
import resolveDbConfig from './resolve_db_config.js';

export type { DrizzleDb, TransactionResult, UserDbCredentials };

/**
 * Runs a query as the anonymous role. See `cloudflare-next-intl-db`'s
 * `withPublicDb` for the full transaction/transport contract — this wrapper
 * only adds `@intl-config` auto-resolution and Firebase Auth wiring on top.
 *
 * @param dbOverride A `db` block to use instead of `@intl-config`'s — the
 * only thing a standalone (non-Next.js) caller of THIS package needs to
 * pass. Call `cloudflare-next-intl-db` directly instead if you have no
 * `@intl-config` at all.
 */
export async function withPublicDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    return withPublicDbImpl(fn, config);
}

/** Runs a query as the signed-in user. See `withPublicDb`'s doc comment for the `dbOverride` contract. */
export async function withUserDb<T>(
    fn: (db: DrizzleDb) => Promise<T>,
    auth?: string | null | UserDbCredentials,
    dbOverride?: DbRoutingConfig,
): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    return withUserDbImpl(fn, auth, config);
}

/**
 * Runs a query as the **service role** — bypasses RLS entirely. See
 * `cloudflare-next-intl-db`'s `withServiceDb` for the full contract (both
 * Supabase-mode via `db.supabase.serviceRoleKey` and connection-string mode,
 * which skips the role downgrade `withPublicDb`/`withUserDb` apply); this
 * wrapper only adds `@intl-config` auto-resolution on top (there is no
 * Firebase Auth wiring to add here — the service role isn't a signed-in
 * user).
 *
 * Never wire this to anything a request/user can influence — see the
 * warnings on `cloudflare-next-intl-db`'s `withServiceDb` doc comment.
 */
export async function withServiceDb<T>(fn: (db: DrizzleDb) => Promise<T>, dbOverride?: DbRoutingConfig): Promise<T> {
    const config = await resolveDbConfig(dbOverride);
    return withServiceDbImpl(fn, config);
}

/** Resolves the caller's id/token/role — see `cloudflare-next-intl-db`'s `resolveUserDbCredentials`. */
export async function resolveUserDbCredentials(dbOverride?: DbRoutingConfig): Promise<UserDbCredentials> {
    const config = await resolveDbConfig(dbOverride);
    return resolveUserDbCredentialsImpl(config);
}

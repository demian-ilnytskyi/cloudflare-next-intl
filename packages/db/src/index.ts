/**
 * Framework-agnostic Postgres/Drizzle/Supabase data-access layer.
 * `cloudflare-next-intl`'s `./db` subpath re-exports this package and layers
 * its own `@intl-config`/Firebase Auth convenience on top (see
 * `packages/cloudflare-next-intl/src/db/index.ts`); call this package directly when you have
 * neither Next.js nor `@intl-config` — a Deno Supabase Edge Function, a
 * plain Node script, a Firebase Function.
 *
 * Pick a wrapper by who is allowed to see the rows:
 * - {@link withPublicDb} — anonymous role, for data any visitor may read.
 * - {@link withUserDb} — the signed-in user, with RLS applied to their id.
 *
 * `pg`, `drizzle-orm`, and `@supabase/supabase-js` all load through dynamic
 * `import()` inside these functions, so an app that never calls a `db`
 * export never bundles any of them.
 */
export { withPublicDb, withUserDb, resolveUserDbCredentials } from './context.js';
export type { UserDbCredentials, DrizzleDb, TransactionResult } from './context.js';
export { withDbClient, connectToPostgres, disconnectPostgres, resetConnectionState, withSessionLock } from './connection.js';
export type {
    DbConfig,
    DbRoutingConfig,
    SupabaseDbConfig,
    GenerateRoutingConfig,
    ErrorHandlingRoutingConfig,
    ErrorHandlingParams,
    AuthUserResolverResult,
    ConfigValue,
    FallibleConfigValue,
} from './types.js';

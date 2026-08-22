/**
 * Optional Postgres/Drizzle data-access layer, reached from
 * `cloudflare-next-intl/db`. Enable it by setting `db` on your `RoutingConfig`;
 * every export here throws a descriptive error if that config is missing.
 *
 * Pick a wrapper by who is allowed to see the rows:
 * - {@link withPublicDb} — anonymous role, for data any visitor may read.
 * - {@link withUserDb} — the signed-in user, with RLS applied to their id.
 *
 * `pg` and `drizzle-orm` load through dynamic `import()` inside those
 * functions, so an app that never calls one never bundles them.
 *
 * Generic Drizzle SQL helpers (`excluded`, `onConflictSet`, `ago`, …) live in
 * the separate `cloudflare-next-intl/dbHelpers` entry point.
 */
export { withPublicDb, withUserDb } from './context';
export type { DrizzleDb } from './context';
export { default as connectToPostgres, disconnectPostgres, resetConnectionState } from './connection';
export type { DbRoutingConfig } from '../types/types';

import type { DbRoutingConfig } from '../types/types';
/**
 * Every `db` export calls this before touching `pg`/`drizzle-orm`. Throws
 * instead of silently no-op'ing so a consumer who calls e.g.
 * `withPublicContext()` without setting `db` on their `RoutingConfig` gets an
 * immediate, actionable error rather than a failed query.
 */
export default function requireDbConfig(db: DbRoutingConfig | undefined): asserts db is DbRoutingConfig;

import type { DbRoutingConfig } from '../types/types.js';
export default function requireDbConfig(db: DbRoutingConfig | undefined): asserts db is DbRoutingConfig;

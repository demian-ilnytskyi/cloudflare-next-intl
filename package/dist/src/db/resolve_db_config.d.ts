import type { DbRoutingConfig } from '../types/types.js';
import type { DbConfig } from './connection.js';
export default function resolveDbConfig(dbOverride?: DbRoutingConfig): Promise<DbConfig>;

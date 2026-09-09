import type { DbRoutingConfig, DbConfig } from '@cloudflare-next-intl/db';
export default function resolveDbConfig(dbOverride?: DbRoutingConfig): Promise<DbConfig>;

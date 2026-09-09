import { describe, it, expect } from 'vitest';
import requireDbConfig from './require_config.js';
import type { DbRoutingConfig } from '../types/types.js';

describe('requireDbConfig', () => {
    it('throws when db config is undefined', () => {
        expect(() => requireDbConfig(undefined)).toThrow(/`db` is not set/);
    });

    it('does not throw when db config is provided', () => {
        const db: DbRoutingConfig = { connectionString: 'postgresql://localhost:5432/postgres' };
        expect(() => requireDbConfig(db)).not.toThrow();
    });
});

import { describe, it, expect, vi } from 'vitest';
import type { DbRoutingConfig } from '../types/types.js';
import resolveDbConfig from './resolve_db_config.js';

describe('resolveDbConfig', () => {
    it('returns the @intl-config config unchanged when no override is given', async () => {
        const config = await resolveDbConfig();
        expect(config.locales).toEqual(['en', 'de']);
        expect(config.db).toBeUndefined();
    });

    it('merges an override db block onto the @intl-config config', async () => {
        const dbOverride: DbRoutingConfig = { connectionString: 'postgresql://localhost:5432/postgres' };
        const config = await resolveDbConfig(dbOverride);
        expect(config.db).toBe(dbOverride);
        expect(config.locales).toEqual(['en', 'de']);
    });

    it('falls back to a bare config when @intl-config is not set and an override is given', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: undefined }));
        const { default: resolveDbConfigStandalone } = await import('./resolve_db_config.js');
        const dbOverride: DbRoutingConfig = { connectionString: 'postgresql://localhost:5432/postgres' };
        const config = await resolveDbConfigStandalone(dbOverride);
        expect(config).toEqual({ db: dbOverride });
        vi.doUnmock('@intl-config');
        vi.resetModules();
    });

    it('returns a bare config when @intl-config is not set and no override is given', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: undefined }));
        const { default: resolveDbConfigStandalone } = await import('./resolve_db_config.js');
        const config = await resolveDbConfigStandalone();
        expect(config).toEqual({});
        vi.doUnmock('@intl-config');
        vi.resetModules();
    });
});

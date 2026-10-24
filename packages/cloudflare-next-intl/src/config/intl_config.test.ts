import { describe, it, expect, vi } from 'vitest';
import config from './intl_config.js';

describe('intl_config default export', () => {
    it('re-exports the configured routing config', () => {
        expect(config.locales).toEqual(['en', 'de']);
        expect(config.defaultLocale).toBe('en');
    });

    it('returns undefined without calling getConfig for then, default, and symbols', () => {
        expect((config as unknown as Record<string, unknown>).then).toBeUndefined();
        expect((config as unknown as Record<string, unknown>).default).toBeUndefined();
        expect((config as unknown as Record<symbol, unknown>)[Symbol('custom')]).toBeUndefined();
    });
});

describe('intl_config error branch', () => {
    it('throws when no config is set', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: undefined }));
        const { default: missingConfig } = await import('./intl_config.js');
        expect(() => missingConfig.locales).toThrow(
            'the `@intl-config` alias is not set',
        );
        vi.doUnmock('@intl-config');
    });
});

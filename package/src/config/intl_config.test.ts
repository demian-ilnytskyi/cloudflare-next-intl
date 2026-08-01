import { describe, it, expect, vi } from 'vitest';
import config from './intl_config';

describe('intl_config default export', () => {
    it('re-exports the configured routing config', () => {
        expect(config.locales).toEqual(['en', 'de']);
        expect(config.defaultLocale).toBe('en');
    });
});

describe('intl_config error branch', () => {
    it('throws when no config is set', async () => {
        vi.resetModules();
        vi.doMock('@intl-config', () => ({ default: undefined }));
        await expect(import('./intl_config')).rejects.toThrow(
            'the `@intl-config` alias is not set',
        );
    });
});

import { describe, it, expect } from 'vitest';
import resolveConfigValue from './resolve_config_value.js';

describe('resolveConfigValue', () => {
    it('returns a direct value unchanged', async () => {
        await expect(resolveConfigValue('postgresql://x')).resolves.toBe('postgresql://x');
    });

    it('calls a sync resolver', async () => {
        await expect(resolveConfigValue(() => 'sync')).resolves.toBe('sync');
    });

    it('awaits an async resolver', async () => {
        await expect(resolveConfigValue(async () => 'async')).resolves.toBe('async');
    });

    it('returns undefined when nothing is configured', async () => {
        await expect(resolveConfigValue(undefined)).resolves.toBeUndefined();
    });

    it('passes through a direct null', async () => {
        await expect(resolveConfigValue(null)).resolves.toBeNull();
    });

    it('passes through null from a sync resolver', async () => {
        await expect(resolveConfigValue(() => null)).resolves.toBeNull();
    });

    it('passes through null from an async resolver', async () => {
        await expect(resolveConfigValue(async () => null)).resolves.toBeNull();
    });
});

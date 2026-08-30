import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildIdAsset } from './build_id_asset.js';

interface GenerateBundleContext { environment?: { name: string }; emitFile: (asset: unknown) => void }
function callGenerateBundle(plugin: ReturnType<typeof buildIdAsset>, context: GenerateBundleContext): void {
    (plugin.generateBundle as (this: GenerateBundleContext) => void).call(context);
}

describe('buildIdAsset', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.__VINEXT_SHARED_BUILD_ID;
        delete process.env.__VINEXT_BUILD_ID;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('returns plugin with expected metadata', () => {
        const plugin = buildIdAsset();
        expect(plugin.name).toBe('cfni:build-id-asset');
        expect(plugin.apply).toBe('build');
        expect(typeof plugin.generateBundle).toBe('function');
    });

    it('ignores non-client environments', () => {
        const plugin = buildIdAsset();
        process.env.__VINEXT_SHARED_BUILD_ID = 'test-build-id';
        const emitFile = vi.fn();

        const context = {
            environment: { name: 'server' },
            emitFile,
        };

        callGenerateBundle(plugin, context);
        expect(emitFile).not.toHaveBeenCalled();
    });

    it('ignores when environment is undefined', () => {
        const plugin = buildIdAsset();
        process.env.__VINEXT_SHARED_BUILD_ID = 'test-build-id';
        const emitFile = vi.fn();

        const context = {
            emitFile,
        };

        callGenerateBundle(plugin, context);
        expect(emitFile).not.toHaveBeenCalled();
    });

    it('ignores when no build id env var is present', () => {
        const plugin = buildIdAsset();
        const emitFile = vi.fn();

        const context = {
            environment: { name: 'client' },
            emitFile,
        };

        callGenerateBundle(plugin, context);
        expect(emitFile).not.toHaveBeenCalled();
    });

    it('emits default fileName asset using __VINEXT_SHARED_BUILD_ID', () => {
        const plugin = buildIdAsset();
        process.env.__VINEXT_SHARED_BUILD_ID = 'shared-123';
        const emitFile = vi.fn();

        const context = {
            environment: { name: 'client' },
            emitFile,
        };

        callGenerateBundle(plugin, context);
        expect(emitFile).toHaveBeenCalledWith({
            type: 'asset',
            fileName: 'BUILD_ID',
            source: 'shared-123',
        });
    });

    it('emits custom fileName asset using __VINEXT_BUILD_ID fallback', () => {
        const plugin = buildIdAsset('CUSTOM_BUILD_ID');
        process.env.__VINEXT_BUILD_ID = 'vinext-456';
        const emitFile = vi.fn();

        const context = {
            environment: { name: 'client' },
            emitFile,
        };

        callGenerateBundle(plugin, context);
        expect(emitFile).toHaveBeenCalledWith({
            type: 'asset',
            fileName: 'CUSTOM_BUILD_ID',
            source: 'vinext-456',
        });
    });
});

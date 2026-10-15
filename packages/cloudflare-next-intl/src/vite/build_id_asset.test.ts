import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildIdAsset } from './build_id_asset.js';

interface FakeBuilder {
    config: {
        root: string;
        logger: {
            warn: ReturnType<typeof vi.fn>;
        };
    };
    environments: Record<string, { config: { build: { outDir: string } } }>;
}

const createBuilder = (root: string, envs: Record<string, string>): FakeBuilder => ({
    config: { root, logger: { warn: vi.fn() } },
    environments: Object.fromEntries(
        Object.entries(envs).map(([k, outDir]) => [k, { config: { build: { outDir } } }])
    ),
});

async function callBuildApp(plugin: ReturnType<typeof buildIdAsset>, builder: FakeBuilder): Promise<void> {
    const hook = plugin.buildApp;
    if (!hook) throw new Error('buildApp hook not defined');
    if (typeof hook === 'function') {
        await (hook as any).call({} as any, builder);
    } else if ('handler' in hook) {
        await (hook.handler as any).call({} as any, builder);
    }
}

describe('buildIdAsset', () => {
    const originalEnv = process.env;
    let tempDir: string;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.__VINEXT_SHARED_BUILD_ID;
        delete process.env.__VINEXT_BUILD_ID;
        tempDir = mkdtempSync(join(tmpdir(), 'cfni-build-id-test-'));
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns plugin with expected metadata', () => {
        const plugin = buildIdAsset();
        expect(plugin.name).toBe('cfni:build-id-asset');
        expect(plugin.apply).toBe('build');
        expect(plugin.buildApp).toBeDefined();
        if (typeof plugin.buildApp === 'object' && plugin.buildApp !== null && 'order' in plugin.buildApp) {
            expect(plugin.buildApp.order).toBe('post');
            expect(typeof plugin.buildApp.handler).toBe('function');
        }
    });

    it('emits BUILD_ID from __VINEXT_SHARED_BUILD_ID env var', async () => {
        const plugin = buildIdAsset();
        process.env.__VINEXT_SHARED_BUILD_ID = 'shared-1';
        const builder = createBuilder(tempDir, { client: 'dist/client' });

        await callBuildApp(plugin, builder);

        const targetFile = resolve(tempDir, 'dist/client', 'BUILD_ID');
        expect(existsSync(targetFile)).toBe(true);
        expect(readFileSync(targetFile, 'utf8')).toBe('shared-1');
        expect(builder.config.logger.warn).not.toHaveBeenCalled();
    });

    it('reads trimmed server BUILD_ID file when env vars are missing', async () => {
        const plugin = buildIdAsset();
        const serverDir = resolve(tempDir, 'dist/server');
        mkdirSync(serverDir, { recursive: true });
        writeFileSync(resolve(serverDir, 'BUILD_ID'), 'abc\n');

        const builder = createBuilder(tempDir, { client: 'dist/client' });

        await callBuildApp(plugin, builder);

        const targetFile = resolve(tempDir, 'dist/client', 'BUILD_ID');
        expect(readFileSync(targetFile, 'utf8')).toBe('abc');
        expect(builder.config.logger.warn).not.toHaveBeenCalled();
    });

    it('prefers rsc outDir BUILD_ID over dist/server', async () => {
        const plugin = buildIdAsset();
        const rscDir = resolve(tempDir, 'out/rsc');
        const serverDir = resolve(tempDir, 'dist/server');
        mkdirSync(rscDir, { recursive: true });
        mkdirSync(serverDir, { recursive: true });
        writeFileSync(resolve(rscDir, 'BUILD_ID'), 'rsc-123\n');
        writeFileSync(resolve(serverDir, 'BUILD_ID'), 'dist-server-456\n');

        const builder = createBuilder(tempDir, { client: 'dist/client', rsc: 'out/rsc' });

        await callBuildApp(plugin, builder);

        const targetFile = resolve(tempDir, 'dist/client', 'BUILD_ID');
        expect(readFileSync(targetFile, 'utf8')).toBe('rsc-123');
        expect(builder.config.logger.warn).not.toHaveBeenCalled();
    });

    it('generates timestamp id and warns when nothing is found', async () => {
        const plugin = buildIdAsset();
        vi.spyOn(Date, "now").mockReturnValue(1700000000000);
        const builder = createBuilder(tempDir, { client: 'dist/client' });

        await callBuildApp(plugin, builder);

        const targetFile = resolve(tempDir, 'dist/client', 'BUILD_ID');
        expect(readFileSync(targetFile, 'utf8')).toBe('1700000000000');
        expect(builder.config.logger.warn).toHaveBeenCalledTimes(1);
        expect(builder.config.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[cfni:build-id-asset] build id not found; using generated 1700000000000')
        );
    });

    it('does nothing when no client environment is present', async () => {
        const plugin = buildIdAsset();
        const builder = createBuilder(tempDir, { ssr: 'dist/server' });

        await callBuildApp(plugin, builder);

        expect(builder.config.logger.warn).not.toHaveBeenCalled();
        expect(existsSync(resolve(tempDir, 'dist/client'))).toBe(false);
    });

    it('supports custom fileName parameter', async () => {
        const plugin = buildIdAsset('version.txt');
        process.env.__VINEXT_SHARED_BUILD_ID = 'custom-id';
        const builder = createBuilder(tempDir, { client: 'dist/client' });

        await callBuildApp(plugin, builder);

        const targetFile = resolve(tempDir, 'dist/client', 'version.txt');
        expect(existsSync(targetFile)).toBe(true);
        expect(readFileSync(targetFile, 'utf8')).toBe('custom-id');
    });

    it('resolves relative client outDir against root', async () => {
        const plugin = buildIdAsset();
        process.env.__VINEXT_BUILD_ID = 'vinext-env-id';
        const builder = createBuilder(tempDir, { client: './custom/nested/client' });

        await callBuildApp(plugin, builder);

        const targetFile = resolve(tempDir, 'custom/nested/client', 'BUILD_ID');
        expect(existsSync(targetFile)).toBe(true);
        expect(readFileSync(targetFile, 'utf8')).toBe('vinext-env-id');
    });
});

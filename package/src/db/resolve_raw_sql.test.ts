import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import resolveRawSql from './resolve_raw_sql';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfni-raw-sql-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
    const path = join(dir, relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
}

describe('resolveRawSql', () => {
    it('reports unknown when no next.config exists', () => {
        const result = resolveRawSql(dir);
        expect(result.status).toBe('unknown');
        expect(result.reason).toMatch(/no next\.config/);
    });

    it('reports unknown when next.config has no @intl-config alias', () => {
        write('next.config.ts', 'export default {}');
        const result = resolveRawSql(dir);
        expect(result.status).toBe('unknown');
        expect(result.reason).toMatch(/no "@intl-config" alias/);
    });

    it('reports unknown when the aliased config file does not exist', () => {
        write('next.config.ts', `
            const nextConfig = {
                webpack(config) {
                    config.resolve.alias = { "@intl-config": path.resolve(__dirname, "src/i18n/intl_config") };
                    return config;
                },
            };
        `);
        const result = resolveRawSql(dir);
        expect(result.status).toBe('unknown');
        expect(result.reason).toMatch(/no matching file/);
    });

    it('reports unknown when the config file has no literal rawSql', () => {
        write('next.config.ts', `
            const nextConfig = {
                turbopack: { resolveAlias: { "@intl-config": "./src/i18n/intl_config.ts" } },
            };
        `);
        write('src/i18n/intl_config.ts', 'export default setIntlConfig({ locales: ["en"], defaultLocale: "en" });');
        const result = resolveRawSql(dir);
        expect(result.status).toBe('unknown');
        expect(result.reason).toMatch(/no literal/);
    });

    it('finds rawSql: true via the turbopack alias form', () => {
        write('next.config.ts', `
            const nextConfig = {
                turbopack: { resolveAlias: { "@intl-config": "./src/i18n/intl_config.ts" } },
            };
        `);
        write('src/i18n/intl_config.ts', `
            export default setIntlConfig({
                locales: ["en"],
                defaultLocale: "en",
                db: { supabase: { rawSql: true } },
            });
        `);
        const result = resolveRawSql(dir);
        expect(result).toEqual({ status: 'true', reason: expect.stringContaining('rawSql: true') });
    });

    it('finds rawSql: false via the webpack path.resolve alias form', () => {
        write('next.config.ts', `
            const nextConfig = {
                webpack(config) {
                    config.resolve.alias = {
                        ...config.resolve.alias,
                        "@intl-config": path.resolve(__dirname, "src/i18n/intl_config"),
                    };
                    return config;
                },
            };
        `);
        write('src/i18n/intl_config.ts', `
            export default setIntlConfig({
                db: { supabase: { rawSql: false } },
            });
        `);
        const result = resolveRawSql(dir);
        expect(result).toEqual({ status: 'false', reason: expect.stringContaining('rawSql: false') });
    });

    it('resolves the aliased file without an extension in the alias string', () => {
        write('next.config.ts', `
            const nextConfig = {
                turbopack: { resolveAlias: { "@intl-config": "./src/i18n/intl_config" } },
            };
        `);
        write('src/i18n/intl_config.ts', 'export default setIntlConfig({ db: { supabase: { rawSql: true } } });');
        const result = resolveRawSql(dir);
        expect(result.status).toBe('true');
    });

    it('prefers next.config.ts over other extensions when both exist', () => {
        write('next.config.mjs', 'module.exports = {}');
        write('next.config.ts', `
            const nextConfig = {
                turbopack: { resolveAlias: { "@intl-config": "./src/i18n/intl_config.ts" } },
            };
        `);
        write('src/i18n/intl_config.ts', 'export default setIntlConfig({ db: { supabase: { rawSql: true } } });');
        const result = resolveRawSql(dir);
        expect(result.status).toBe('true');
    });

    it('resolves an absolute alias path directly', () => {
        write('next.config.ts', `
            const nextConfig = {
                turbopack: { resolveAlias: { "@intl-config": "${join(dir, 'src/i18n/intl_config.ts').replace(/\\/g, '\\\\')}" } },
            };
        `);
        write('src/i18n/intl_config.ts', 'export default setIntlConfig({ db: { supabase: { rawSql: true } } });');
        const result = resolveRawSql(dir);
        expect(result.status).toBe('true');
    });
});

import { describe, it, expect } from 'vitest';
import resolveCodegenPaths from './codegen_paths';

const cwd = '/app';

describe('resolveCodegenPaths', () => {
    it('uses the documented defaults', () => {
        const paths = resolveCodegenPaths([], {}, cwd);
        expect(paths.ddlDir).toBe('/app/supabase/data-base');
        expect(paths.outDir).toBe('/app/src/shared/db/generated');
        expect(paths.outFile).toBe('/app/src/shared/db/generated/schema.ts');
        expect(paths.manifest).toBe('/app/src/shared/db/generated/manifest.json');
        expect(paths.pullDir).toBe('/app/src/shared/db/.drizzle-pull');
        expect(paths.dbUrl).toBe('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
        expect(paths.check).toBe(false);
        expect(paths.timeoutMs).toBe(5000);
        expect(paths.drizzleConfig).toBe(null);
    });

    it('generates into several out dirs from repeated flags', () => {
        const paths = resolveCodegenPaths(['--out-dir=a/gen', '--out-dir=/other/gen'], {}, cwd);
        expect(paths.targets.map((t) => t.outFile)).toEqual([
            '/app/a/gen/schema.ts',
            '/other/gen/schema.ts',
        ]);
        expect(paths.outDir).toBe('/app/a/gen');
    });

    it('accepts a comma separated out dir list from env', () => {
        const paths = resolveCodegenPaths([], { CFNI_DB_OUT_DIR: 'a/gen, b/gen' }, cwd);
        expect(paths.targets.map((t) => t.manifest)).toEqual([
            '/app/a/gen/manifest.json',
            '/app/b/gen/manifest.json',
        ]);
    });

    it('defaults to a single target', () => {
        expect(resolveCodegenPaths([], {}, cwd).targets).toHaveLength(1);
    });

    it('honours flags over env over defaults', () => {
        const paths = resolveCodegenPaths(
            ['--out-dir=db/models', '--check'],
            { CFNI_DB_OUT_DIR: 'ignored', CFNI_DB_DDL_DIR: 'sql', CODEGEN_DATABASE_URL: 'postgresql://remote' },
            cwd,
        );
        expect(paths.outDir).toBe('/app/db/models');
        expect(paths.ddlDir).toBe('/app/sql');
        expect(paths.dbUrl).toBe('postgresql://remote');
        expect(paths.check).toBe(true);
    });

    it('accepts an absolute out dir and a custom out file', () => {
        const paths = resolveCodegenPaths(['--out-dir=/tmp/gen', '--out-file=models.ts'], {}, cwd);
        expect(paths.outDir).toBe('/tmp/gen');
        expect(paths.outFile).toBe('/tmp/gen/models.ts');
    });

    it('reads ddl-dir and out-file from env when flags are absent', () => {
        const paths = resolveCodegenPaths(
            [],
            { CFNI_DB_DDL_DIR: 'ddl', CFNI_DB_OUT_FILE: 'models.ts', CODEGEN_CONNECT_TIMEOUT_MS: '9000' },
            cwd,
        );
        expect(paths.ddlDir).toBe('/app/ddl');
        expect(paths.outFile).toBe('/app/src/shared/db/generated/models.ts');
        expect(paths.timeoutMs).toBe(9000);
    });

    it('resolves drizzle-config from a flag relative to cwd', () => {
        const paths = resolveCodegenPaths(['--drizzle-config=drizzle.config.ts'], {}, cwd);
        expect(paths.drizzleConfig).toBe('/app/drizzle.config.ts');
    });

    it('resolves drizzle-config from env when the flag is absent', () => {
        const paths = resolveCodegenPaths([], { CFNI_DB_DRIZZLE_CONFIG: '/abs/drizzle.config.ts' }, cwd);
        expect(paths.drizzleConfig).toBe('/abs/drizzle.config.ts');
    });

    it('resolves db-url from a flag over env', () => {
        const paths = resolveCodegenPaths(
            ['--db-url=postgresql://flag'],
            { CODEGEN_DATABASE_URL: 'postgresql://env' },
            cwd,
        );
        expect(paths.dbUrl).toBe('postgresql://flag');
    });
});

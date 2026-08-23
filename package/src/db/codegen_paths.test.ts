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
        expect(paths.dbUrlExplicit).toBe(false);
        expect(paths.check).toBe(false);
        expect(paths.timeoutMs).toBe(5000);
        expect(paths.drizzleConfig).toBe(null);
        expect(paths.rpcDir).toBe('/app/supabase/data-base/rpcs');
        expect(paths.rpcFile).toBe('/app/supabase/data-base/rpcs/cfni_exec.sql');
        expect(paths.testsDir).toBe('/app/supabase/tests');
        expect(paths.testsFile).toBe('/app/supabase/tests/cfni_exec.sql');
        expect(paths.force).toBe(false);
        expect(paths.skipExec).toBe(false);
    });

    it('reads skipExec from a flag or env var', () => {
        expect(resolveCodegenPaths(['--skip-exec'], {}, cwd).skipExec).toBe(true);
        expect(resolveCodegenPaths([], { CFNI_DB_SKIP_EXEC: 'true' }, cwd).skipExec).toBe(true);
        expect(resolveCodegenPaths([], { CFNI_DB_SKIP_EXEC: 'false' }, cwd).skipExec).toBe(false);
    });

    it('derives rpc dir inside, and tests dir as a sibling of, a custom ddl-dir', () => {
        const paths = resolveCodegenPaths(['--ddl-dir=sql/ddl'], {}, cwd);
        expect(paths.rpcDir).toBe('/app/sql/ddl/rpcs');
        expect(paths.testsDir).toBe('/app/sql/tests');
    });

    it('resolves rpc-dir and tests-dir from flags', () => {
        const paths = resolveCodegenPaths(['--rpc-dir=custom/rpc', '--tests-dir=custom/tests'], {}, cwd);
        expect(paths.rpcDir).toBe('/app/custom/rpc');
        expect(paths.rpcFile).toBe('/app/custom/rpc/cfni_exec.sql');
        expect(paths.testsDir).toBe('/app/custom/tests');
        expect(paths.testsFile).toBe('/app/custom/tests/cfni_exec.sql');
    });

    it('resolves rpc-dir and tests-dir from env when flags are absent', () => {
        const paths = resolveCodegenPaths([], { CFNI_DB_RPC_DIR: 'env/rpc', CFNI_DB_TESTS_DIR: 'env/tests' }, cwd);
        expect(paths.rpcDir).toBe('/app/env/rpc');
        expect(paths.testsDir).toBe('/app/env/tests');
    });

    it('resolves rpc-file-name and tests-file-name from flags', () => {
        const paths = resolveCodegenPaths(['--rpc-file-name=cfni_exec_and_batch.sql', '--tests-file-name=cfni_exec_and_batch.sql'], {}, cwd);
        expect(paths.rpcFile).toBe('/app/supabase/data-base/rpcs/cfni_exec_and_batch.sql');
        expect(paths.testsFile).toBe('/app/supabase/tests/cfni_exec_and_batch.sql');
    });

    it('resolves rpc-file-name and tests-file-name from env when flags are absent', () => {
        const paths = resolveCodegenPaths(
            [],
            { CFNI_DB_RPC_FILE_NAME: 'env_exec.sql', CFNI_DB_TESTS_FILE_NAME: 'env_exec_tests.sql' },
            cwd,
        );
        expect(paths.rpcFile).toBe('/app/supabase/data-base/rpcs/env_exec.sql');
        expect(paths.testsFile).toBe('/app/supabase/tests/env_exec_tests.sql');
    });

    it('honors a custom rpc-file-name flag together with a custom rpc-dir', () => {
        const paths = resolveCodegenPaths(['--rpc-dir=custom/rpc', '--rpc-file-name=my_exec.sql'], {}, cwd);
        expect(paths.rpcFile).toBe('/app/custom/rpc/my_exec.sql');
    });

    it('reads force from a flag or env var', () => {
        expect(resolveCodegenPaths(['--force'], {}, cwd).force).toBe(true);
        expect(resolveCodegenPaths([], { CFNI_DB_FORCE_EXEC: 'true' }, cwd).force).toBe(true);
        expect(resolveCodegenPaths([], { CFNI_DB_FORCE_EXEC: 'false' }, cwd).force).toBe(false);
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

    it('marks dbUrlExplicit true only when a flag or env var set it', () => {
        expect(resolveCodegenPaths([], {}, cwd).dbUrlExplicit).toBe(false);
        expect(resolveCodegenPaths(['--db-url=postgresql://flag'], {}, cwd).dbUrlExplicit).toBe(true);
        expect(resolveCodegenPaths([], { CODEGEN_DATABASE_URL: 'postgresql://env' }, cwd).dbUrlExplicit).toBe(true);
    });
});

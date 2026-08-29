import { dirname, isAbsolute, join, resolve } from 'node:path';
const DEFAULT_DDL_DIR = 'supabase/data-base';
const DEFAULT_OUT_DIR = 'src/shared/db/generated';
const DEFAULT_OUT_FILE = 'schema.ts';
const DEFAULT_DB_URL = null;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RPC_FILE_NAME = 'cfni_exec.sql';
const DEFAULT_TESTS_FILE_NAME = 'cfni_exec.sql';
function flags(argv, name) {
    const prefix = `--${name}=`;
    return argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}
function list(value) {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
}
function flag(argv, name) {
    const prefix = `--${name}=`;
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit?.slice(prefix.length);
}
function abs(cwd, value) {
    return isAbsolute(value) ? value : resolve(cwd, value);
}
/** Resolves every codegen path from flags, then env, then the documented defaults. */
export default function resolveCodegenPaths(argv, env, cwd) {
    const ddlDir = abs(cwd, flag(argv, 'ddl-dir') ?? env.CFNI_DB_DDL_DIR ?? DEFAULT_DDL_DIR);
    const outDirArgs = flags(argv, 'out-dir').flatMap(list);
    const outDirs = (outDirArgs.length > 0
        ? outDirArgs
        : list(env.CFNI_DB_OUT_DIR ?? '')).map((dir) => abs(cwd, dir));
    if (outDirs.length === 0)
        outDirs.push(abs(cwd, DEFAULT_OUT_DIR));
    const outDir = outDirs[0];
    const outFileName = flag(argv, 'out-file') ?? env.CFNI_DB_OUT_FILE ?? DEFAULT_OUT_FILE;
    const drizzleConfig = flag(argv, 'drizzle-config') ?? env.CFNI_DB_DRIZZLE_CONFIG ?? null;
    // rpcDir defaults inside ddlDir itself (default `supabase/data-base` →
    // `supabase/data-base/rpcs`), matching where a project's DDL walk (and
    // this package's own `supabase/data-base/rpcs/`) actually keeps RPC
    // definitions. testsDir stays a sibling of ddlDir (`supabase/tests`) —
    // pgTAP tests aren't part of the DDL a project applies to its database.
    const supabaseRoot = dirname(ddlDir);
    const rpcDir = abs(cwd, flag(argv, 'rpc-dir') ?? env.CFNI_DB_RPC_DIR ?? join(ddlDir, 'rpcs'));
    const testsDir = abs(cwd, flag(argv, 'tests-dir') ?? env.CFNI_DB_TESTS_DIR ?? join(supabaseRoot, 'tests'));
    const rpcFileName = flag(argv, 'rpc-file-name') ?? env.CFNI_DB_RPC_FILE_NAME ?? DEFAULT_RPC_FILE_NAME;
    const testsFileName = flag(argv, 'tests-file-name') ?? env.CFNI_DB_TESTS_FILE_NAME ?? DEFAULT_TESTS_FILE_NAME;
    return {
        ddlDir,
        targets: outDirs.map((dir) => ({
            outDir: dir,
            outFile: join(dir, outFileName),
            manifest: join(dir, 'manifest.json'),
        })),
        outDir,
        outFile: join(outDir, outFileName),
        pullDir: resolve(outDir, '..', '.drizzle-pull'),
        manifest: join(outDir, 'manifest.json'),
        dbUrl: flag(argv, 'db-url') ?? env.CODEGEN_DATABASE_URL ?? DEFAULT_DB_URL,
        dbUrlExplicit: flag(argv, 'db-url') !== undefined || env.CODEGEN_DATABASE_URL !== undefined,
        check: argv.includes('--check'),
        timeoutMs: Number(env.CODEGEN_CONNECT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
        drizzleConfig: drizzleConfig === null ? null : abs(cwd, drizzleConfig),
        rpcDir,
        rpcFile: join(rpcDir, rpcFileName),
        testsDir,
        testsFile: join(testsDir, testsFileName),
        force: argv.includes('--force') || env.CFNI_DB_FORCE_EXEC === 'true',
        skipExec: argv.includes('--skip-exec') || env.CFNI_DB_SKIP_EXEC === 'true',
    };
}

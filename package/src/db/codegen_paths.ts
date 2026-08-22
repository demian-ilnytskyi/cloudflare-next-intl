import { isAbsolute, join, resolve } from 'node:path';

export interface CodegenPaths {
    ddlDir: string;
    outDir: string;
    outFile: string;
    pullDir: string;
    manifest: string;
    dbUrl: string;
    check: boolean;
    timeoutMs: number;
    drizzleConfig: string | null;
}

const DEFAULT_DDL_DIR = 'supabase/data-base';
const DEFAULT_OUT_DIR = 'src/shared/db/generated';
const DEFAULT_OUT_FILE = 'schema.ts';
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DEFAULT_TIMEOUT_MS = 5000;

function flag(argv: readonly string[], name: string): string | undefined {
    const prefix = `--${name}=`;
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit?.slice(prefix.length);
}

function abs(cwd: string, value: string): string {
    return isAbsolute(value) ? value : resolve(cwd, value);
}

/** Resolves every codegen path from flags, then env, then the documented defaults. */
export default function resolveCodegenPaths(
    argv: readonly string[],
    env: Record<string, string | undefined>,
    cwd: string,
): CodegenPaths {
    const ddlDir = abs(cwd, flag(argv, 'ddl-dir') ?? env.CFNI_DB_DDL_DIR ?? DEFAULT_DDL_DIR);
    const outDir = abs(cwd, flag(argv, 'out-dir') ?? env.CFNI_DB_OUT_DIR ?? DEFAULT_OUT_DIR);
    const outFileName = flag(argv, 'out-file') ?? env.CFNI_DB_OUT_FILE ?? DEFAULT_OUT_FILE;
    const drizzleConfig = flag(argv, 'drizzle-config') ?? env.CFNI_DB_DRIZZLE_CONFIG ?? null;
    return {
        ddlDir,
        outDir,
        outFile: join(outDir, outFileName),
        pullDir: resolve(outDir, '..', '.drizzle-pull'),
        manifest: join(outDir, 'manifest.json'),
        dbUrl: flag(argv, 'db-url') ?? env.CODEGEN_DATABASE_URL ?? DEFAULT_DB_URL,
        check: argv.includes('--check'),
        timeoutMs: Number(env.CODEGEN_CONNECT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
        drizzleConfig: drizzleConfig === null ? null : abs(cwd, drizzleConfig),
    };
}

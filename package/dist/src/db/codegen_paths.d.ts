export interface CodegenTarget {
    outDir: string;
    outFile: string;
    manifest: string;
}
export interface CodegenPaths {
    ddlDir: string;
    targets: CodegenTarget[];
    outDir: string;
    outFile: string;
    pullDir: string;
    manifest: string;
    dbUrl: string;
    check: boolean;
    timeoutMs: number;
    drizzleConfig: string | null;
    rpcDir: string;
    rpcFile: string;
    testsDir: string;
    testsFile: string;
    force: boolean;
    skipExec: boolean;
}
/** Resolves every codegen path from flags, then env, then the documented defaults. */
export default function resolveCodegenPaths(argv: readonly string[], env: Record<string, string | undefined>, cwd: string): CodegenPaths;

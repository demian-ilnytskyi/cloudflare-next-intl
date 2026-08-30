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
    dbUrl: string | null;
    dbUrlExplicit: boolean;
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
export default function resolveCodegenPaths(argv: readonly string[], env: Record<string, string | undefined>, cwd: string): CodegenPaths;

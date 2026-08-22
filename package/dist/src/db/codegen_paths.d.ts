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
/** Resolves every codegen path from flags, then env, then the documented defaults. */
export default function resolveCodegenPaths(argv: readonly string[], env: Record<string, string | undefined>, cwd: string): CodegenPaths;

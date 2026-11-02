import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

export interface PruneResult {
    prunedFiles: string[];
    bytesSaved: number;
}

/**
 * Removes unoptimized image files from target build output directories (e.g. `dist/client`),
 * cleaning up any parent directories that become empty.
 * Never deletes files in source directories (only operates within the given outDirs).
 */
export function pruneBuildOutput(
    outDirs: string[],
    prunableRelativePaths: string[],
): PruneResult {
    const prunedFiles: string[] = [];
    let bytesSaved = 0;

    for (const outDir of outDirs) {
        if (!existsSync(outDir)) continue;

        for (const relPath of prunableRelativePaths) {
            const cleanRel = relPath.replace(/^\/+/, "");
            const fullPath = path.resolve(outDir, cleanRel);

            // Safety guard: ensure the target is strictly inside outDir
            if (!fullPath.startsWith(outDir)) continue;

            if (existsSync(fullPath)) {
                try {
                    const st = statSync(fullPath);
                    if (st.isFile()) {
                        bytesSaved += st.size;
                        unlinkSync(fullPath);
                        prunedFiles.push(fullPath);

                        // Clean up empty parent directories up to outDir
                        let parent = path.dirname(fullPath);
                        while (parent !== outDir && parent.startsWith(outDir)) {
                            try {
                                const remaining = readdirSync(parent);
                                if (remaining.length === 0) {
                                    rmdirSync(parent);
                                    parent = path.dirname(parent);
                                } else {
                                    break;
                                }
                            } catch {
                                break;
                            }
                        }
                    }
                } catch {
                    // Ignore transient file system errors during prune
                }
            }
        }
    }

    return { prunedFiles, bytesSaved };
}


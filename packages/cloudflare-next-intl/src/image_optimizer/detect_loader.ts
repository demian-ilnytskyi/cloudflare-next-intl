import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const VIRTUAL_IMAGE_LOADER_ID = "virtual:cloudflare-next-intl-image-loader";
export const RESOLVED_IMAGE_LOADER_ID = "\0" + VIRTUAL_IMAGE_LOADER_ID;

export const NEXT_CONFIG_CANDIDATES = [
    "next.config.ts",
    "next.config.mts",
    "next.config.mjs",
    "next.config.js",
    "next.config.cjs",
] as const;

export const DEFAULT_LOADER_CANDIDATES = [
    "image-loader.ts",
    "image-loader.js",
    "image-loader.mjs",
    "image-loader.cjs",
    "image-loader.tsx",
    "image-loader.jsx",
    "src/image-loader.ts",
    "src/image-loader.js",
    "src/image-loader.mjs",
    "src/image-loader.cjs",
    "src/image-loader.tsx",
    "src/image-loader.jsx",
] as const;

export interface AutoImageLoaderOptions {
    /**
     * Enable/disable automatic image loader detection.
     * @default true
     */
    enabled?: boolean;

    /**
     * Path to the custom image loader file relative to project root or absolute path.
     * Defaults to detecting `images.loaderFile` in `next.config.*`, or searching
     * `image-loader.ts`, `image-loader.js`, `src/image-loader.ts`, etc.
     * @default "image-loader.ts"
     */
    file?: string;

    /**
     * Specific export name to use from the loader file.
     * If omitted, auto-detects `default` export first, or the first exported function/variable.
     */
    exportName?: string;

    /**
     * Project root directory. Defaults to `process.cwd()`.
     */
    root?: string;
}

/**
 * Attempts to extract custom images.loaderFile path from next.config.* if present.
 */
export function findLoaderFileFromNextConfig(root: string): string | null {
    for (const name of NEXT_CONFIG_CANDIDATES) {
        const configPath = path.resolve(root, name);
        if (!existsSync(configPath)) continue;

        const raw = readFileSync(configPath, "utf8");
        const stripped = raw
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*/g, "");

        const match = stripped.match(/loaderFile\s*:\s*["'`]([^"'`]+)["'`]/);
        if (match?.[1]) {
            const candidate = match[1].trim();
            const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
            if (existsSync(resolved)) {
                return resolved;
            }
            const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
            for (const ext of extensions) {
                if (existsSync(resolved + ext)) {
                    return resolved + ext;
                }
            }
        }
    }
    return null;
}

export interface DetectedImageLoader {
    exists: boolean;
    isEmpty: boolean;
    loaderPath: string | null;
    exportName: string | null;
}

/**
 * Parses file content to find the exported image loader function or variable name.
 */
export function findExportedLoaderName(code: string, preferredExportName?: string): string | null {
    const stripped = code
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");

    if (preferredExportName) {
        if (preferredExportName === "default") {
            if (/export\s+default\b/.test(stripped) || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(stripped)) {
                return "default";
            }
            return null;
        }

        const fnRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${preferredExportName}\\b`);
        if (fnRegex.test(stripped)) return preferredExportName;

        const constRegex = new RegExp(`export\\s+(?:const|let|var)\\s+${preferredExportName}\\b`);
        if (constRegex.test(stripped)) return preferredExportName;

        const reExportRegex = new RegExp(`export\\s*\\{[^}]*\\b(?:as\\s+)?${preferredExportName}\\b[^}]*\\}`);
        if (reExportRegex.test(stripped)) return preferredExportName;

        return null;
    }

    // 1. Check for default export
    if (/export\s+default\b/.test(stripped) || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(stripped)) {
        return "default";
    }

    // 2. Check for exported function declarations
    const fnMatch = stripped.match(/export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
    if (fnMatch?.[1]) {
        return fnMatch[1];
    }

    // 3. Check for exported variable declarations
    const varMatch = stripped.match(/export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/);
    if (varMatch?.[1]) {
        return varMatch[1];
    }

    // 4. Check for named export list: export { foo } or export { bar as foo }
    const exportBlockMatch = stripped.match(/export\s*\{([^}]+)\}/);
    if (exportBlockMatch?.[1]) {
        const entries = exportBlockMatch[1].split(",");
        for (const entry of entries) {
            const parts = entry.trim().split(/\s+as\s+/);
            const exportedName = parts[parts.length - 1]?.trim();
            if (exportedName) {
                return exportedName;
            }
        }
    }

    return null;
}

/**
 * Detects the presence of an image-loader file and its exported loader function.
 */
export function detectImageLoader(options?: AutoImageLoaderOptions): DetectedImageLoader {
    const root = options?.root ? path.resolve(options.root) : process.cwd();
    let targetPath: string | null = null;

    if (options?.file) {
        const customPath = path.isAbsolute(options.file) ? options.file : path.resolve(root, options.file);
        if (existsSync(customPath)) {
            targetPath = customPath;
        } else {
            return { exists: false, isEmpty: false, loaderPath: null, exportName: null };
        }
    } else {
        const configLoader = findLoaderFileFromNextConfig(root);
        if (configLoader) {
            targetPath = configLoader;
        } else {
            for (const candidate of DEFAULT_LOADER_CANDIDATES) {
                const candidatePath = path.resolve(root, candidate);
                if (existsSync(candidatePath)) {
                    targetPath = candidatePath;
                    break;
                }
            }
        }
    }

    if (!targetPath) {
        return { exists: false, isEmpty: false, loaderPath: null, exportName: null };
    }

    const content = readFileSync(targetPath, "utf8");
    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "").trim();
    if (!stripped) {
        return { exists: true, isEmpty: true, loaderPath: targetPath, exportName: null };
    }

    const exportName = findExportedLoaderName(content, options?.exportName);
    return {
        exists: true,
        isEmpty: false,
        loaderPath: targetPath,
        exportName,
    };
}

/**
 * Generates the virtual module source code for importing and re-exporting the detected loader.
 */
export function generateLoaderVirtualModule(detected: DetectedImageLoader): string {
    if (!detected.exists || detected.isEmpty || !detected.loaderPath || !detected.exportName) {
        return `export const defaultLoader = undefined;\nexport const hasCustomLoader = false;\nexport default undefined;\n`;
    }

    const normalizedPath = detected.loaderPath.replace(/\\/g, "/");
    if (detected.exportName === "default") {
        return `import loader from ${JSON.stringify(normalizedPath)};\nexport const defaultLoader = loader;\nexport const hasCustomLoader = true;\nexport default loader;\n`;
    }

    return `import { ${detected.exportName} as loader } from ${JSON.stringify(normalizedPath)};\nexport const defaultLoader = loader;\nexport const hasCustomLoader = true;\nexport default loader;\n`;
}

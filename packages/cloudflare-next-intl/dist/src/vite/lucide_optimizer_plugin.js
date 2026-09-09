import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
export const JS_EXT_RE = /\.[cm]?[jt]sx?$/;
export const LUCIDE_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s*['"]lucide-react['"];?/g;
export const NEXT_JS_IMPORT_RE = /(['"])next\/([a-zA-Z0-9_-]+)\.js\1/g;
export function detectLucideReact(root) {
    try {
        const req = createRequire(path.join(root, "package.json"));
        req.resolve("lucide-react");
        return true;
    }
    catch {
        return fs.existsSync(path.join(root, "node_modules", "lucide-react"));
    }
}
export function resolveLucideEsmEntry(root) {
    try {
        const req = createRequire(path.join(root, "package.json"));
        const pkgJsonPath = req.resolve("lucide-react/package.json");
        const dir = path.dirname(pkgJsonPath);
        const esm = path.join(dir, "dist", "esm", "lucide-react.mjs");
        if (fs.existsSync(esm))
            return esm;
    }
    catch {
        const fallback = path.join(root, "node_modules", "lucide-react", "dist", "esm", "lucide-react.mjs");
        if (fs.existsSync(fallback))
            return fallback;
    }
    return null;
}
export function parseLucideIconMap(esmEntryPath) {
    const iconMap = new Map();
    try {
        const content = fs.readFileSync(esmEntryPath, "utf8");
        const exportRegex = /export\s*\{\s*([^}]+)\s*\}\s*from\s*['"](\.\/icons\/[^'"]+)['"];/g;
        let match;
        while ((match = exportRegex.exec(content)) !== null) {
            const [, specifiers, file] = match;
            const normalizedFile = file.replace(/^\.\//, "lucide-react/dist/esm/");
            for (const part of specifiers.split(",")) {
                const m = part.trim().match(/(?:(\w+)\s+as\s+)?(\w+)$/);
                if (m)
                    iconMap.set(m[2], normalizedFile);
            }
        }
        iconMap.set("LucideProvider", "lucide-react/dist/esm/context.mjs");
        iconMap.set("useLucideContext", "lucide-react/dist/esm/context.mjs");
    }
    catch {
    }
    return iconMap;
}
export function transformLucideImports(code, iconMap) {
    if (!code.includes("lucide-react") || iconMap.size === 0) {
        return { code, changed: false };
    }
    let changed = false;
    const replaced = code.replace(new RegExp(LUCIDE_IMPORT_RE), (_match, specifiersStr) => {
        const clean = specifiersStr
            .replace(/\/\/[^\n]*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
        const parts = clean
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        const newImports = [];
        const remaining = [];
        for (const part of parts) {
            if (part.startsWith("type ")) {
                remaining.push(part);
                continue;
            }
            const m = part.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
            if (m) {
                const [, imported, local] = m;
                const iconPath = iconMap.get(imported);
                if (iconPath) {
                    newImports.push(`import ${local || imported} from "${iconPath}";`);
                    continue;
                }
            }
            remaining.push(part);
        }
        if (remaining.length > 0) {
            newImports.push(`import { ${remaining.join(", ")} } from "lucide-react";`);
        }
        return newImports.join("\n");
    });
    if (replaced !== code) {
        changed = true;
    }
    return { code: replaced, changed };
}
export function transformNextJsImports(code) {
    if (!code.includes("next/") || !code.includes(".js")) {
        return { code, changed: false };
    }
    const replaced = code.replace(new RegExp(NEXT_JS_IMPORT_RE), "$1next/$2$1");
    return { code: replaced, changed: replaced !== code };
}
export function lucideOptimizerPlugin(options = {}) {
    let resolvedRoot = options.root ?? process.cwd();
    let isLucidePresent = false;
    let iconMap = new Map();
    const normalizeNext = options.normalizeNextJsImports ?? true;
    return {
        name: "cloudflare-next-intl-lucide-optimizer",
        enforce: "pre",
        config(config) {
            const root = config.root || resolvedRoot;
            resolvedRoot = root;
            isLucidePresent = detectLucideReact(root);
            if (isLucidePresent) {
                const entry = options.lucideEntryPath ?? resolveLucideEsmEntry(root);
                if (entry) {
                    iconMap = parseLucideIconMap(entry);
                }
            }
            const vinextHeadersShim = path.join(root, "node_modules", "vinext", "dist", "shims", "headers.js");
            const hasVinextHeaders = fs.existsSync(vinextHeadersShim);
            const aliasEntries = [];
            if (hasVinextHeaders) {
                aliasEntries.push({
                    find: /^next\/headers(\.js)?$/,
                    replacement: vinextHeadersShim,
                });
            }
            if (normalizeNext) {
                aliasEntries.push({
                    find: /^next\/(.+)\.js$/,
                    replacement: "next/$1",
                });
            }
            return {
                resolve: {
                    alias: aliasEntries,
                },
                optimizeDeps: {
                    include: [
                        "next/dynamic",
                        "next/link",
                        "next/navigation",
                        "next/image",
                    ],
                    exclude: [
                        "next/server",
                        "next/headers",
                        ...(isLucidePresent ? ["lucide-react"] : []),
                    ],
                },
            };
        },
        configResolved(config) {
            if (config.root) {
                resolvedRoot = config.root;
            }
        },
        transform(code, id) {
            const cleanId = id.split("?")[0];
            if (!JS_EXT_RE.test(cleanId) || cleanId.includes("node_modules/lucide-react")) {
                return null;
            }
            if (cleanId.includes("node_modules") && !cleanId.includes("cloudflare-next-intl")) {
                return null;
            }
            let transformed = code;
            let hasChange = false;
            if (isLucidePresent && iconMap.size > 0) {
                const res = transformLucideImports(transformed, iconMap);
                if (res.changed) {
                    transformed = res.code;
                    hasChange = true;
                }
            }
            if (normalizeNext) {
                const res = transformNextJsImports(transformed);
                if (res.changed) {
                    transformed = res.code;
                    hasChange = true;
                }
            }
            if (!hasChange) {
                return null;
            }
            return { code: transformed, map: null };
        },
    };
}

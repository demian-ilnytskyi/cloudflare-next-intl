import type { Plugin } from "vite";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

export interface LocaleFilePluginOptions {
    /**
     * Directory containing translation json files (e.g. `./messages`).
     * @default "./messages"
     */
    messagesDir?: string;

    /**
     * Path to `intl_config.ts`.
     */
    intlConfigPath?: string;

    /**
     * Root directory of the project. Defaults to `process.cwd()`.
     */
    root?: string;
}

export function resolveDefaultIntlConfigPath(root: string): string {
    const candidates = [
        path.join(root, "src", "l18n", "intl_config.ts"),
        path.join(root, "src", "l18n", "intl_config.js"),
        path.join(root, "src", "intl_config.ts"),
        path.join(root, "src", "intl_config.js"),
        path.join(root, "intl_config.ts"),
        path.join(root, "intl_config.js"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}

export function getCfniDistSrcDir(root: string): string {
    try {
        const require = createRequire(path.join(root, "package.json"));
        const pkgEntry = require.resolve("cloudflare-next-intl");
        const distDir = path.dirname(pkgEntry);
        const distSrc = path.join(distDir, "src");
        return distSrc.replace(/\\/g, "/");
    } catch {
        const fallback = path.join(root, "node_modules", "cloudflare-next-intl", "dist", "src");
        return fallback.replace(/\\/g, "/");
    }
}

export function localeFilePlugin(options: LocaleFilePluginOptions = {}): Plugin {
    let resolvedRoot = options.root ?? process.cwd();
    let resolvedMessagesDir = options.messagesDir
        ? (path.isAbsolute(options.messagesDir) ? options.messagesDir : path.join(resolvedRoot, options.messagesDir))
        : path.join(resolvedRoot, "messages");
    let resolvedIntlConfigPath = options.intlConfigPath
        ? (path.isAbsolute(options.intlConfigPath) ? options.intlConfigPath : path.join(resolvedRoot, options.intlConfigPath))
        : resolveDefaultIntlConfigPath(resolvedRoot);

    return {
        name: "cfni:locale-file",
        enforce: "pre",
        configResolved(config) {
            resolvedRoot = options.root ?? config.root ?? process.cwd();
            if (!options.messagesDir) {
                resolvedMessagesDir = path.join(resolvedRoot, "messages");
            }
            if (!options.intlConfigPath) {
                resolvedIntlConfigPath = resolveDefaultIntlConfigPath(resolvedRoot);
            }
        },
        resolveId(id) {
            if (id.startsWith("@locale-file/")) {
                const file = id.replace("@locale-file/", "");
                return path.join(resolvedMessagesDir, file);
            }
            if (id === "@intl-config") {
                return resolvedIntlConfigPath;
            }
            if (id === "cloudflare-next-intl" && this.environment?.name === "rsc") {
                return "\0cloudflare-next-intl:rsc";
            }
        },
        load(id) {
            if (id === "\0cloudflare-next-intl:rsc") {
                const cfniDir = getCfniDistSrcDir(resolvedRoot);
                return `
export * from '${cfniDir}/config/index.js';
export * from '${cfniDir}/general/index.js';
export * from '${cfniDir}/server/index.js';
export * from '${cfniDir}/theme_switcher/index.js';
export * from '${cfniDir}/types/index.js';
export * from '${cfniDir}/client/index.js';
`;
            }
        },
        transform(code, id) {
            if (id.includes("cloudflare-next-intl") && code.includes("@locale-file")) {
                const globPattern = `/messages/*.json`;
                return {
                    code: `
const __cfni_locales__ = import.meta.glob('${globPattern}', { eager: true });
${code.replace(
                        /\(await import\([`'"]@locale-file\/\$\{locale\}\.json[`'"]\)\)\.default/g,
                        `(__cfni_locales__[\`/messages/\${locale}.json\`]?.default ?? (() => { throw new Error('missing locale'); })())`
                    )}`,
                    map: null,
                };
            }
        },
    };
}

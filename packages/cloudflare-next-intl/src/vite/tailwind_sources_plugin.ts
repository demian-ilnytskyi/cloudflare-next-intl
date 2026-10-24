import type { Plugin } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TAILWIND_IMPORT = /@import\s+["']tailwindcss["'][^;]*;/;
const SUB_PACKAGE_PREFIX = "cloudflare-next-intl-";

function readPackageJson(dir: string): { name?: string; dependencies?: Record<string, string> } | undefined {
    const file = join(dir, "package.json");
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

function ancestors(fromDir: string): string[] {
    const dirs = [fromDir];
    while (dirname(dirs[dirs.length - 1]!) !== dirs[dirs.length - 1]) dirs.push(dirname(dirs[dirs.length - 1]!));
    return dirs;
}

export function findPackageRoot(fromDir: string, name: string): string | undefined {
    return ancestors(fromDir).find((dir) => readPackageJson(dir)?.name === name);
}

export function findDependencyDir(fromDir: string, name: string): string | undefined {
    return ancestors(fromDir)
        .map((dir) => join(dir, "node_modules", name))
        .find((candidate) => existsSync(join(candidate, "package.json")));
}

export function resolveTailwindSourceDirs(selfDir: string = dirname(fileURLToPath(import.meta.url))): string[] {
    const root = findPackageRoot(selfDir, "cloudflare-next-intl");
    if (!root) return [];
    const deps = Object.keys(readPackageJson(root)?.dependencies ?? {}).filter((name) => name.startsWith(SUB_PACKAGE_PREFIX));
    const depDirs = deps.map((name) => findDependencyDir(root, name)).filter((dir): dir is string => dir !== undefined);
    return [root, ...depDirs];
}

export function injectTailwindSources(code: string, cssFile: string, dirs: string[]): string | undefined {
    const match = TAILWIND_IMPORT.exec(code);
    if (!match || dirs.length === 0) return undefined;
    const sources = dirs
        .map((dir) => `@source ${JSON.stringify(`${relative(dirname(cssFile), dir).split(sep).join("/")}/`)};`)
        .join("\n");
    const end = match.index + match[0].length;
    return `${code.slice(0, end)}\n${sources}${code.slice(end)}`;
}

/**
 * Tailwind only scans the paths a stylesheet lists with `@source`, and skips
 * nested `node_modules`. Classes used by cloudflare-next-intl and its
 * `cloudflare-next-intl-*` sub-packages (theme switcher, error board, ...)
 * would otherwise never be generated. This injects an `@source` for each of
 * them right after `@import "tailwindcss"` in any CSS file that has it.
 */
export function tailwindSourcesPlugin(options: { dirs?: string[] } = {}): Plugin {
    let dirs = options.dirs;
    return {
        name: "cfni:tailwind-sources",
        enforce: "pre",
        transform(code, id) {
            const file = id.split("?")[0]!;
            if (!file.endsWith(".css")) return;
            dirs ??= resolveTailwindSourceDirs();
            const injected = injectTailwindSources(code, file, dirs);
            if (injected === undefined) return;
            return { code: injected, map: null };
        },
    };
}

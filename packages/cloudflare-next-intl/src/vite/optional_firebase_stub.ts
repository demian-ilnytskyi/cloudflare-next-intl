import type { Plugin, UserConfig } from "vite";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const OPTIONAL_FIREBASE_MODULES = [
    "@firebase/app",
    "@firebase/auth",
    "@firebase/app-check",
    "@firebase/performance",
] as const;

export const OPTIONAL_FIREBASE_STUB_PREFIX = "\0cfni:optional-firebase-stub:";

export const optionalFirebaseStubId = (id: string): string => `${OPTIONAL_FIREBASE_STUB_PREFIX}${id}`;

export function optionalFirebaseStubCode(id: string): string {
    const message = `cloudflare-next-intl: "${id}" is not installed. Add \`firebase\` (or ${id}) to your dependencies to use firebaseAuth features.`;
    return `throw new Error(${JSON.stringify(message)});\n`;
}

export function isModuleInstalled(id: string, root: string): boolean {
    try {
        createRequire(pathToFileURL(resolve(root, "package.json"))).resolve(id);
        return true;
    } catch {
        return false;
    }
}

/**
 * The `@firebase/*` peers are only reached through config-guarded dynamic
 * `import()`s, so an app that never uses firebaseAuth has no reason to
 * install them — but Vite still resolves those specifiers statically and
 * fails dev/build with "Failed to resolve import". This maps an absent peer
 * to a module whose body throws, so resolution succeeds and the error only
 * surfaces if the import is actually evaluated at runtime.
 */
export function optionalFirebaseStubPlugin(options: { root?: string } = {}): Plugin {
    const missing = new Set<string>();

    return {
        name: "cfni:optional-firebase-stub",
        enforce: "pre",
        config(config: UserConfig) {
            const root = options.root ?? config.root ?? process.cwd();
            for (const id of OPTIONAL_FIREBASE_MODULES) {
                if (!isModuleInstalled(id, root)) missing.add(id);
            }
            if (missing.size === 0) return;
            return { optimizeDeps: { exclude: [...missing] } };
        },
        resolveId(id) {
            if (missing.has(id)) return optionalFirebaseStubId(id);
        },
        load(id) {
            if (!id.startsWith(OPTIONAL_FIREBASE_STUB_PREFIX)) return;
            return optionalFirebaseStubCode(id.slice(OPTIONAL_FIREBASE_STUB_PREFIX.length));
        },
    };
}

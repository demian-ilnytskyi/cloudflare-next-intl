import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { matchesNamespacePattern } from "./match_namespace.js";
import { findJsxPropValues, scanFile, type DynamicCall } from "./scan_file.js";

export { matchesNamespacePattern };

export interface ScanProjectOptions { root: string; dirs?: string[]; packages?: string[]; fallbackNamespaces?: string[]; onDynamic?: "all" | "fallback" }
export interface ClientMessagesManifest { namespaces: string[] | true; dynamicCalls: DynamicCall[]; scannedFiles: number }

const EXT = /\.(tsx?|jsx?|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".git"]);

function walk(dir: string, out: string[], skipNodeModules: boolean): void {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (SKIP_DIRS.has(name) && (skipNodeModules || name !== "dist")) continue;
            walk(full, out, skipNodeModules);
        } else if (EXT.test(name) && !/\.(test|spec|bench)\./.test(name) && !name.endsWith(".d.ts")) out.push(full);
    }
}

export function scanProject(opts: ScanProjectOptions): ClientMessagesManifest {
    const files: string[] = [];
    for (const d of opts.dirs ?? ["src", "app", "components"]) {
        const full = join(opts.root, d);
        if (existsSync(full)) walk(full, files, true);
    }
    const found = new Set<string>(opts.fallbackNamespaces ?? []);
    for (const pkg of opts.packages ?? []) {
        const pkgDir = join(opts.root, "node_modules", pkg);
        const pjPath = join(pkgDir, "package.json");
        if (!existsSync(pjPath)) continue;
        const pj = JSON.parse(readFileSync(pjPath, "utf8")) as { i18n?: { namespaces?: string[] } };
        if (Array.isArray(pj.i18n?.namespaces)) pj.i18n.namespaces.forEach((n) => found.add(n));
        else walk(pkgDir, files, false);
    }
    let dynamicCalls: DynamicCall[] = [];
    let usesRoot = false;
    const sources = new Map<string, string>();
    for (const f of files) {
        const code = readFileSync(f, "utf8");
        sources.set(f, code);
        const r = scanFile(f, code);
        r.namespaces.forEach((n) => found.add(n));
        dynamicCalls.push(...r.dynamicCalls);
        usesRoot ||= r.usesRoot;
    }
    dynamicCalls = dynamicCalls.filter((call) => {
        if (!call.prop) return true;
        const values: string[] = [];
        for (const [f, code] of sources) {
            const v = findJsxPropValues(f, code, call.prop.component, call.prop.name);
            if (v === null) return true;
            values.push(...v);
        }
        if (values.length === 0) return true;
        values.forEach((v) => found.add(v.split(".")[0]));
        return false;
    });
    const sendAll = usesRoot || (dynamicCalls.length > 0 && (opts.onDynamic ?? "all") === "all");
    return { namespaces: sendAll ? true : [...found].sort(), dynamicCalls, scannedFiles: files.length };
}

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage } from './detect_dynamic_usage.js';
import { traceDynamicUsage } from './trace_dynamic_usage.js';
import { insertDynamicExport } from './insert_dynamic_export.js';
import type { AliasConfig } from './resolve_local_imports.js';

/** `'off'` — don't scan at all (the global disable switch). `'report'` — scan and say what would change, write nothing. `'fix'` — scan and write the missing `export const dynamic` into each qualifying file. */
export type DynamicPagesCheckMode = 'off' | 'report' | 'fix';

export interface CheckDynamicPagesOptions {
    /** Root directory to scan recursively for `page.*`/`route.*` files — typically your Next.js `app/` directory. */
    appDir: string;
    /**
     * Defaults to `'report'`. The codemod's import-boundary detection is a
     * text heuristic, not a real parser, so `'fix'` can misplace the
     * inserted export on an unusual file; opt in explicitly once you've
     * reviewed a `'report'` run's output.
     */
    mode?: DynamicPagesCheckMode;
    /**
     * Defaults to `'next'`. On real Next.js, a page with no detected
     * dynamic-API usage is left untouched — Next infers static/dynamic on
     * its own, so inserting `force-static` there would be an unsafe
     * default (a page can be dynamic through means this text-based scan
     * doesn't see). **vinext doesn't do that inference**: a page with no
     * explicit `dynamic` export is never prerendered, regardless of
     * whether it actually uses any dynamic API. Pass `'vinext'` to restore
     * `force-static` insertion on "no signal detected" for that runtime.
     */
    target?: 'next' | 'vinext';
    /** File paths (as returned by `findPageFiles` — i.e. joined with `appDir`) to leave completely alone: not read, not written, not reported as anything but `'skipped'`. */
    skip?: readonly string[];
    /**
     * Defaults to `true`. When enabled, a page's dynamic-API signal search
     * also follows its local (relative/`aliases`-prefixed) imports —
     * transitively, cycle-safe, capped — so a signal in an imported
     * component or repository counts too, not just the page file's own
     * text. Set `false` to restore the original single-file-only scan.
     */
    resolveImports?: boolean;
    /**
     * Alias prefixes to resolve during import tracing (ignored when
     * `resolveImports` is `false`). Defaults to a single `'@/'` entry
     * resolving to `appDir`'s parent directory (the common `src/app` +
     * `@/*` -> `./src/*` tsconfig convention) — pass your own to override.
     */
    aliases?: readonly AliasConfig[];
}

export interface CheckDynamicPagesReport {
    file: string;
    action: 'added-force-dynamic' | 'would-add-force-dynamic' | 'added-force-static' | 'would-add-force-static' | 'already-declared' | 'no-dynamic-usage-detected' | 'skipped';
}

export interface CheckDynamicPagesIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
    isFile?: (file: string) => boolean;
}

function defaultIsFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

export async function checkDynamicPages(
    options: CheckDynamicPagesOptions,
    io: CheckDynamicPagesIo = {},
): Promise<CheckDynamicPagesReport[]> {
    const mode = options.mode ?? 'report';
    if (mode === 'off') return [];
    const target = options.target ?? 'next';
    const resolveImports = options.resolveImports ?? true;

    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const isFile = io.isFile ?? defaultIsFile;
    const skipSet = new Set(options.skip ?? []);
    const aliases: readonly AliasConfig[] = options.aliases ?? [
        { prefix: '@/', replacement: resolve(options.appDir, '..') },
    ];

    const reports: CheckDynamicPagesReport[] = [];
    for (const file of findPageFiles(options.appDir)) {
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }

        const source = readFile(file);
        const detection = resolveImports
            ? traceDynamicUsage(file, source, aliases, { readFile, isFile })
            : detectDynamicUsage(source);
        if (detection.hasExplicitDynamicExport) {
            reports.push({ file, action: 'already-declared' });
            continue;
        }
        if (detection.detectedDynamicApis.length === 0) {
            // On real Next.js, leave it to Next's own static/dynamic
            // inference — a false negative here just means Next decides
            // instead of us. On vinext, no explicit export means "never
            // prerendered" regardless of usage, so `force-static` is the
            // correct default there, not an unsafe one.
            if (target !== 'vinext') {
                reports.push({ file, action: 'no-dynamic-usage-detected' });
                continue;
            }
            if (mode === 'fix') {
                writeFile(file, insertDynamicExport(source, 'force-static'));
                reports.push({ file, action: 'added-force-static' });
            } else {
                reports.push({ file, action: 'would-add-force-static' });
            }
            continue;
        }

        if (mode === 'fix') {
            writeFile(file, insertDynamicExport(source, 'force-dynamic'));
            reports.push({ file, action: 'added-force-dynamic' });
        } else {
            reports.push({ file, action: 'would-add-force-dynamic' });
        }
    }
    return reports;
}

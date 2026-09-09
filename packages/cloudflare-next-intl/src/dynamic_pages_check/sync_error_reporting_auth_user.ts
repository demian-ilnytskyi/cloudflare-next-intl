import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';
import { collectReachableFiles } from './collect_reachable_files.js';
import { findReportErrorCalls } from './find_report_error_calls.js';
import type { AliasConfig } from './resolve_local_imports.js';
import type { DynamicPagesCheckMode } from './check_dynamic_pages.js';

export interface SyncErrorReportingAuthUserOptions {
    appDir: string;
    mode?: DynamicPagesCheckMode;
    target?: 'next' | 'vinext';
    skip?: readonly string[];
    aliases?: readonly AliasConfig[];
}

export interface SyncErrorReportingAuthUserReport {
    file: string;
    action: 'added-use-auth-user' | 'would-add-use-auth-user';
    /** How many `reportError()` calls in this file were (or would be) touched. */
    callCount: number;
}

export interface SyncErrorReportingAuthUserIo {
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

function isConfirmedDynamic(source: string, reachableApis: readonly string[], target: 'next' | 'vinext'): boolean {
    const explicit = readExplicitDynamicValue(source);
    if (explicit !== null) return explicit === 'force-dynamic';
    if (target === 'vinext') return reachableApis.length > 0;
    // target 'next': no explicit export means Next's own inference decides — never confirmed dynamic here.
    return false;
}

/**
 * Whole-app companion pass to `checkDynamicPages`: finds every
 * `reportError(config, { ... })` call reachable from a page this package
 * already knows is `force-dynamic`, and — only when that call's file is
 * reachable from confirmed-dynamic pages ALONE, never from any page whose
 * status isn't confirmed dynamic — inserts `useAuthUser: true,` into its
 * params object. A call in a file shared with even one static/unknown-
 * status page is left untouched, since setting `useAuthUser` there would
 * make `resolveErrorReportingUser` call `getAuthUser()` (`cookies()`) on a
 * request this package can't prove is safe to make dynamic.
 *
 * Deliberately separate from `checkDynamicPages` itself (call both
 * directly, or use `checkDynamicPages`'s `syncErrorReportingAuthUser: true`
 * option to run this immediately after it) — this pass mutates arbitrary
 * call-site argument objects across your app, a materially bigger blast
 * radius than inserting one `export const dynamic` per page, so it stays
 * its own explicit opt-in.
 */
export async function syncErrorReportingAuthUser(
    options: SyncErrorReportingAuthUserOptions,
    io: SyncErrorReportingAuthUserIo = {},
): Promise<SyncErrorReportingAuthUserReport[]> {
    const mode = options.mode ?? 'report';
    if (mode === 'off') return [];
    const target = options.target ?? 'next';

    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const isFile = io.isFile ?? defaultIsFile;
    const skipSet = new Set(options.skip ?? []);
    const aliases: readonly AliasConfig[] = options.aliases ?? [
        { prefix: '@/', replacement: resolve(options.appDir, '..') },
    ];

    const dynamicReachable = new Set<string>();
    const notConfirmedReachable = new Set<string>();
    const fileSources = new Map<string, string>();

    for (const page of findPageFiles(options.appDir)) {
        if (skipSet.has(page)) continue;
        const source = readFile(page);
        const files = collectReachableFiles(page, source, aliases, { readFile, isFile });

        const apis = new Set<string>();
        for (const [file, fileSource] of files) {
            fileSources.set(file, fileSource);
            detectDynamicUsage(fileSource).detectedDynamicApis.forEach((api) => apis.add(api));
        }

        const bucket = isConfirmedDynamic(source, [...apis], target) ? dynamicReachable : notConfirmedReachable;
        for (const file of files.keys()) bucket.add(file);
    }

    const safeFiles = [...dynamicReachable].filter((file) => !notConfirmedReachable.has(file));

    const reports: SyncErrorReportingAuthUserReport[] = [];
    for (const file of safeFiles) {
        const source = fileSources.get(file)!;
        const calls = findReportErrorCalls(source).filter(
            (call) => call.insertPos !== null && !call.hasExplicitUseAuthUser,
        );
        if (calls.length === 0) continue;

        if (mode === 'fix') {
            let rewritten = source;
            // Insert back-to-front so earlier calls' insertPos offsets stay valid.
            for (const call of [...calls].sort((a, b) => b.insertPos! - a.insertPos!)) {
                rewritten = `${rewritten.slice(0, call.insertPos!)}useAuthUser: true, ${rewritten.slice(call.insertPos!)}`;
            }
            writeFile(file, rewritten);
            reports.push({ file, action: 'added-use-auth-user', callCount: calls.length });
        } else {
            reports.push({ file, action: 'would-add-use-auth-user', callCount: calls.length });
        }
    }

    return reports;
}

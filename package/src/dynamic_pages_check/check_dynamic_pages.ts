import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage, readExplicitDynamicValue, type DynamicApiCheck } from './detect_dynamic_usage.js';
import { traceDynamicUsage, type DynamicSignal } from './trace_dynamic_usage.js';
import { insertDynamicExport } from './insert_dynamic_export.js';
import { syncErrorReportingAuthUser, type SyncErrorReportingAuthUserReport } from './sync_error_reporting_auth_user.js';
import { deriveRoute, isApiRoute, makePageLabeler, type PageLabelStyle } from './derive_page_label.js';
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
    /**
     * Defaults to `[]`. Extra `{ name, pattern }` dynamic-API checks, run
     * alongside the built-in list (`cookies()`, `getAuthUser()`, ...) —
     * for a project's own dynamic-wrapping helper this text scan has no
     * way to know about on its own (a custom auth check, a bespoke
     * per-request cache buster). Each `pattern` is matched against the
     * file's text with comments blanked out, same as the built-ins.
     *
     * @example
     * ```ts
     * extraChecks: [{ name: 'myOrgAuth()', pattern: /\bmyOrgAuth\s*\(/ }]
     * ```
     */
    extraChecks?: readonly DynamicApiCheck[];
    /**
     * Defaults to `false`. When enabled, runs `syncErrorReportingAuthUser`
     * immediately after the main per-page scan, using this same
     * `appDir`/`mode`/`target`/`skip`/`aliases` — see that function's docs
     * for what it does and why it's opt-in. Its reports are appended to
     * this call's returned array.
     */
    syncErrorReportingAuthUser?: boolean;
    /**
     * Defaults to `false` — nothing is printed. `true` logs a block per
     * scanned page: its label, whether it's Static (SSG) or Dynamic (SSR),
     * and, for a page forced dynamic, the exact `(api, file, line)` signals
     * that decided it.
     *
     * A page marked dynamic through a helper several imports deep is
     * otherwise indistinguishable from one that reads `cookies()` in its own
     * body, which makes an unexpected `force-dynamic` almost impossible to
     * attribute without bisecting imports by hand. The reasons are always
     * present on the returned reports (`signals`); this flag only controls
     * whether they're also printed.
     *
     * Pass an object instead of `true` to also set `pageLabel` — how each
     * page's own line is displayed:
     * - `'title'` (default): a short name derived from the route, e.g.
     *   `accept-invite/page.tsx` -> `"Accept Invite"`,
     *   `results/[id]/page.tsx` -> `"Results (:id)"`.
     * - `'path'`: the old behavior, the file's path relative to the current
     *   working directory.
     * - a function `(file, appDir) => string` for a custom label.
     */
    verbose?: boolean | { pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string) };
}

export interface CheckDynamicPagesReport {
    file: string;
    action: 'added-force-dynamic' | 'would-add-force-dynamic' | 'added-force-static' | 'would-add-force-static' | 'already-declared' | 'no-dynamic-usage-detected' | 'skipped';
    /**
     * The dynamic-API signals that decided a `force-dynamic` action, each
     * paired with the file it was found in — present (and non-empty) only on
     * the two `*-force-dynamic` actions.
     */
    signals?: DynamicSignal[];
    /**
     * The literal value of an existing `export const dynamic = '...'`,
     * present only on `action: 'already-declared'` and only when that value
     * is one of Next's four recognized literals — `null` for a
     * non-literal expression this text scan can't evaluate.
     */
    explicitValue?: 'force-static' | 'force-dynamic' | 'auto' | 'error' | null;
}

export interface CheckDynamicPagesIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
    isFile?: (file: string) => boolean;
}

const LEGEND = 'λ API   ƒ Dynamic (SSR)   ○ Static (SSG)   = Already declared   - Unclear (framework decides)   · Skipped';

/** Single leading glyph for a report — matches vinext/Next's own route-table symbols (`λ`/`ƒ`/`○`) plus two of this scan's own (`=`/`-`/`·`). */
function actionGlyph(report: CheckDynamicPagesReport, isApi: boolean): string {
    if (isApi && report.action !== 'skipped') return 'λ';
    switch (report.action) {
        case 'added-force-dynamic':
        case 'would-add-force-dynamic':
            return 'ƒ';
        case 'added-force-static':
        case 'would-add-force-static':
            return '○';
        case 'no-dynamic-usage-detected': return '-';
        case 'skipped': return '·';
        case 'already-declared':
            if (report.explicitValue === 'force-dynamic') return 'ƒ';
            if (report.explicitValue === 'force-static') return '○';
            return '=';
    }
}

/** What the glyph on this line means, spelled out — the glyph alone repeats across dozens of pages and stops being legible on its own. */
function actionDetail(report: CheckDynamicPagesReport, isApi: boolean): string {
    if (isApi && report.action !== 'skipped') return 'API route';
    switch (report.action) {
        case 'added-force-dynamic': return 'Dynamic (SSR) — added export const dynamic = "force-dynamic"';
        case 'would-add-force-dynamic': return 'Dynamic (SSR) — would add export const dynamic = "force-dynamic"';
        case 'added-force-static': return 'Static (SSG) — added export const dynamic = "force-static"';
        case 'would-add-force-static': return 'Static (SSG) — would add export const dynamic = "force-static"';
        case 'no-dynamic-usage-detected': return 'Unclear — no dynamic-API usage detected, left to the framework';
        case 'skipped': return 'Skipped — excluded from this scan';
        case 'already-declared':
            switch (report.explicitValue) {
                case 'force-dynamic': return 'Dynamic (SSR) — export const dynamic = "force-dynamic" already set';
                case 'force-static': return 'Static (SSG) — export const dynamic = "force-static" already set';
                case 'auto': return 'export const dynamic = "auto" already set';
                case 'error': return 'export const dynamic = "error" already set';
                default: return 'export const dynamic already set';
            }
    }
}

/** Path as typed in an editor's "go to file" box, not an absolute one nobody can scan. */
function displayPath(file: string): string {
    const rel = relative(process.cwd(), file);
    return rel === '' || rel.startsWith('..') ? file : rel;
}

/**
 * One row per page — `├`/`└` tree connector, `λ`/`ƒ`/`○`/etc glyph, route,
 * and human label, the same shape as vinext/Next's own build-time route
 * table — followed by its signals (if any) indented under a `│`/` `
 * continuation so they visually belong to that row and not the next one.
 */
function logReports(
    reports: readonly CheckDynamicPagesReport[],
    appDir: string,
    pageLabel: (file: string) => string,
): void {
    console.log(`[cloudflare-next-intl] dynamic-pages check\n${LEGEND}\n`);
    reports.forEach((report, index) => {
        const isLast = index === reports.length - 1;
        const branch = isLast ? '└' : '├';
        const isApi = isApiRoute(report.file);
        const glyph = actionGlyph(report, isApi);
        const route = deriveRoute(appDir, report.file);
        console.log(`${branch} ${glyph} ${route}  ${pageLabel(report.file)}  — ${actionDetail(report, isApi)}`);
        const continuation = isLast ? ' ' : '│';
        for (const signal of report.signals ?? []) {
            const location = `${displayPath(signal.file)}:${signal.line}`;
            const where = signal.file === report.file ? `at ${location}` : `via ${location}`;
            console.log(`${continuation}     ↳ ${signal.api}  ${where}`);
        }
    });
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
): Promise<(CheckDynamicPagesReport | SyncErrorReportingAuthUserReport)[]> {
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
    const extraChecks = options.extraChecks ?? [];

    const reports: (CheckDynamicPagesReport | SyncErrorReportingAuthUserReport)[] = [];
    for (const file of findPageFiles(options.appDir)) {
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }

        const source = readFile(file);
        const detection = resolveImports
            ? traceDynamicUsage(file, source, aliases, { readFile, isFile }, extraChecks)
            : { ...detectDynamicUsage(source, extraChecks), signals: [] as DynamicSignal[] };
        const signals: DynamicSignal[] = resolveImports
            ? detection.signals
            : detection.matches.map(({ name, line }) => ({ api: name, file, line }));
        if (detection.hasExplicitDynamicExport) {
            reports.push({ file, action: 'already-declared', explicitValue: readExplicitDynamicValue(source) });
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
            reports.push({ file, action: 'added-force-dynamic', signals });
        } else {
            reports.push({ file, action: 'would-add-force-dynamic', signals });
        }
    }

    if (options.verbose) {
        const pageLabelStyle = typeof options.verbose === 'object' ? options.verbose.pageLabel : undefined;
        const pageLabel = makePageLabeler(options.appDir, pageLabelStyle, displayPath);
        logReports(reports as CheckDynamicPagesReport[], options.appDir, pageLabel);
    }

    if (options.syncErrorReportingAuthUser === true) {
        const syncReports = await syncErrorReportingAuthUser(
            { appDir: options.appDir, mode: options.mode, target: options.target, skip: options.skip, aliases: options.aliases },
            { findPageFiles, readFile, writeFile, isFile },
        );
        reports.push(...syncReports);
    }
    return reports;
}

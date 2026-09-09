import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';
import { traceDynamicUsage } from './trace_dynamic_usage.js';
import { insertDynamicExport } from './insert_dynamic_export.js';
import { syncErrorReportingAuthUser } from './sync_error_reporting_auth_user.js';
import { deriveRoute, isApiRoute, makePageLabeler } from './derive_page_label.js';
import { isVinextAppPageRouteWiringSafeOnDisk } from '../vite/vinext_route_wiring_fix.js';
const LEGEND = 'λ API   ƒ Dynamic (SSR)   ○ Static (SSG)   = Already declared   - Unclear (framework decides)   · Skipped';
function actionGlyph(report, isApi) {
    if (isApi && report.action !== 'skipped')
        return 'λ';
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
            if (report.explicitValue === 'force-dynamic')
                return 'ƒ';
            if (report.explicitValue === 'force-static')
                return '○';
            return '=';
    }
}
function actionDetail(report, isApi) {
    if (isApi && report.action !== 'skipped')
        return 'API route';
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
function displayPath(file) {
    const rel = relative(process.cwd(), file);
    return rel === '' || rel.startsWith('..') ? file : rel;
}
function fileKind(file) {
    const match = /([a-z]+)\.(?:tsx|ts|jsx|js)$/.exec(file);
    return match ? match[1] : file;
}
function logReports(reports, appDir, pageLabel) {
    console.log(`[cloudflare-next-intl] dynamic-pages check\n${LEGEND}\n`);
    reports.forEach((report, index) => {
        const isLast = index === reports.length - 1;
        const branch = isLast ? '└' : '├';
        const isApi = isApiRoute(report.file);
        const glyph = actionGlyph(report, isApi);
        const kind = fileKind(report.file);
        const route = deriveRoute(appDir, report.file) + (kind === 'page' || kind === 'route' ? '' : `/${kind}`);
        console.log(`${branch} ${glyph} ${route}  ${pageLabel(report.file)} [${kind}]  — ${actionDetail(report, isApi)}`);
        const continuation = isLast ? ' ' : '│';
        for (const signal of report.signals ?? []) {
            const location = `${displayPath(signal.file)}:${signal.line}`;
            const where = signal.file === report.file ? `at ${location}` : `via ${location}`;
            console.log(`${continuation}     ↳ ${signal.api}  ${where}`);
        }
    });
}
function defaultIsFile(path) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
function isSsgAction(report) {
    if (report.action === 'added-force-static' || report.action === 'would-add-force-static') {
        return true;
    }
    if (report.action === 'already-declared') {
        return report.explicitValue === 'force-static';
    }
    return false;
}
export async function checkDynamicPages(options, io = {}) {
    const mode = options.mode ?? 'report';
    if (mode === 'off')
        return [];
    const target = options.target ?? 'next';
    const resolveImports = options.resolveImports ?? true;
    let includeLoading = options.includeLoading ?? false;
    if (includeLoading && target === 'vinext' && options.verifyVinextRouteWiring !== false) {
        const projectRoot = options.projectRoot ?? resolve(options.appDir, '..');
        const checkSafe = io.isVinextRouteWiringSafe ?? isVinextAppPageRouteWiringSafeOnDisk;
        if (!checkSafe(projectRoot)) {
            console.warn('[cloudflare-next-intl] WARNING: Vinext route wiring fix is not verified on disk (vinext files may have changed, failed to patch, or patch is disabled). SSG was NOT added to loading.* files.');
            includeLoading = false;
        }
    }
    if (includeLoading) {
        console.warn('[cloudflare-next-intl] WARNING: includeLoading is enabled. Forcing SSG on loading.* files is dangerous and can break route rendering, streaming, or hydration.');
    }
    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file, contents) => writeFileSync(file, contents, 'utf8'));
    const isFile = io.isFile ?? defaultIsFile;
    const skipSet = new Set(options.skip ?? []);
    const aliases = options.aliases ?? [
        { prefix: '@/', replacement: resolve(options.appDir, '..') },
    ];
    const extraChecks = options.extraChecks ?? [];
    const reports = [];
    for (const file of findPageFiles(options.appDir)) {
        if (!includeLoading && fileKind(file) === 'loading') {
            continue;
        }
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }
        const source = readFile(file);
        const detection = resolveImports
            ? traceDynamicUsage(file, source, aliases, { readFile, isFile }, extraChecks)
            : { ...detectDynamicUsage(source, extraChecks), signals: [] };
        const signals = resolveImports
            ? detection.signals
            : detection.matches.map(({ name, line }) => ({ api: name, file, line }));
        if (detection.hasExplicitDynamicExport) {
            reports.push({ file, action: 'already-declared', explicitValue: readExplicitDynamicValue(source) });
            continue;
        }
        if (detection.detectedDynamicApis.length === 0) {
            if (target !== 'vinext') {
                reports.push({ file, action: 'no-dynamic-usage-detected' });
                continue;
            }
            if (mode === 'fix') {
                writeFile(file, insertDynamicExport(source, 'force-static'));
                reports.push({ file, action: 'added-force-static' });
            }
            else {
                reports.push({ file, action: 'would-add-force-static' });
            }
            continue;
        }
        if (mode === 'fix') {
            writeFile(file, insertDynamicExport(source, 'force-dynamic'));
            reports.push({ file, action: 'added-force-dynamic', signals });
        }
        else {
            reports.push({ file, action: 'would-add-force-dynamic', signals });
        }
    }
    if (includeLoading) {
        for (const report of reports) {
            const r = report;
            if (fileKind(r.file) === 'loading' && !isSsgAction(r)) {
                console.warn(`[cloudflare-next-intl] WARNING: Loading file is not static (SSG): ${displayPath(r.file)}`);
            }
        }
    }
    if (options.verbose) {
        const pageLabelStyle = typeof options.verbose === 'object' ? options.verbose.pageLabel : undefined;
        const pageLabel = makePageLabeler(options.appDir, pageLabelStyle, displayPath);
        logReports(reports, options.appDir, pageLabel);
    }
    if (options.syncErrorReportingAuthUser === true) {
        const syncReports = await syncErrorReportingAuthUser({ appDir: options.appDir, mode: options.mode, target: options.target, skip: options.skip, aliases: options.aliases }, { findPageFiles, readFile, writeFile, isFile });
        reports.push(...syncReports);
    }
    return reports;
}

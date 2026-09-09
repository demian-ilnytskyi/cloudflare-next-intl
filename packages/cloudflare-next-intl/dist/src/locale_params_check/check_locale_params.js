import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { detectLocaleParams } from './detect_locale_params.js';
import { insertLocaleParamsSignature, insertLocaleParamsBody, ensureLocaleInParamsType, addParamsPropToExistingDestructure, ensureSetLocaleImport, wrapSyncDefaultExportWithParams, extractParamsPromiseType } from './insert_locale_params.js';
import { findLocaleScopedFiles } from './find_locale_scoped_files.js';
import { deriveRoute, makePageLabeler } from '../dynamic_pages_check/derive_page_label.js';
const ZERO_ARG_DEFAULT_EXPORT = /export\s+default\s+(async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(\s*\)/;
const SYNC_DEFAULT_EXPORT = /export\s+default\s+function\s+[A-Za-z_$][\w$]*\s*\(/;
const LEGEND = '✓ Set up   + Added   ? Needs manual edit   · Skipped';
function actionGlyph(action) {
    switch (action) {
        case 'added-locale-params': return '+';
        case 'would-add-locale-params': return '+';
        case 'already-set-up': return '✓';
        case 'needs-manual-edit': return '?';
        case 'skipped': return '·';
    }
}
function actionDetail(action) {
    switch (action) {
        case 'added-locale-params': return 'Missing locale-param setup — added it';
        case 'would-add-locale-params': return 'Missing locale-param setup — would add it';
        case 'already-set-up': return 'Already resolves locale from params (setLocaleAsync/setLocale)';
        case 'needs-manual-edit': return 'Existing params shape not recognized — needs a manual edit';
        case 'skipped': return 'Skipped — excluded from this scan';
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
    console.log(`[cloudflare-next-intl] locale-params check\n${LEGEND}\n`);
    reports.forEach((report, index) => {
        const isLast = index === reports.length - 1;
        const branch = isLast ? '└' : '├';
        const kind = fileKind(report.file);
        const route = deriveRoute(appDir, report.file) + (kind === 'page' || kind === 'route' ? '' : `/${kind}`);
        console.log(`${branch} ${actionGlyph(report.action)} ${route}  ${pageLabel(report.file)} [${kind}]  — ${actionDetail(report.action)}`);
    });
}
export async function checkLocaleParams(options, io = {}) {
    const mode = options.mode ?? 'report';
    if (mode === 'off')
        return [];
    const defaultLocaleParam = options.localeParam ?? 'locale';
    const findFiles = io.findLocaleScopedFiles ?? findLocaleScopedFiles;
    const readFile = io.readFile ?? ((file) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file, contents) => writeFileSync(file, contents, 'utf8'));
    const skipSet = new Set(options.skip ?? []);
    const overrides = options.overrides ?? {};
    const reports = [];
    for (const file of findFiles(options.appDir, defaultLocaleParam)) {
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }
        const localeParam = overrides[file]?.localeParam ?? defaultLocaleParam;
        const source = readFile(file);
        const detection = detectLocaleParams(source, localeParam);
        if (detection.hasLocaleParamSetup) {
            reports.push({ file, action: 'already-set-up' });
            continue;
        }
        const isZeroArg = ZERO_ARG_DEFAULT_EXPORT.test(source);
        const canReuseExistingParams = detection.hasDestructuredParamsProp && !detection.hasConflictingLocaleBinding;
        const canAddParamsKey = detection.hasDestructuredObjectWithoutParams && !detection.hasConflictingLocaleBinding;
        if (!isZeroArg && !detection.hasInlineDestructure && !canReuseExistingParams && !canAddParamsKey) {
            reports.push({ file, action: 'needs-manual-edit' });
            continue;
        }
        if (mode === 'report') {
            reports.push({ file, action: 'would-add-locale-params' });
            continue;
        }
        const isSyncDefaultExport = !detection.hasInlineDestructure && SYNC_DEFAULT_EXPORT.test(source);
        if (isSyncDefaultExport && (isZeroArg || canAddParamsKey || canReuseExistingParams)) {
            const existingParamsType = canReuseExistingParams ? extractParamsPromiseType(source) ?? undefined : undefined;
            const wrapped = wrapSyncDefaultExportWithParams(source, localeParam, existingParamsType);
            if (wrapped === source) {
                reports.push({ file, action: 'needs-manual-edit' });
                continue;
            }
            writeFile(file, ensureSetLocaleImport(wrapped));
            reports.push({ file, action: 'added-locale-params' });
            continue;
        }
        let updated = source;
        if (isZeroArg) {
            updated = insertLocaleParamsSignature(updated, localeParam);
        }
        else if (canAddParamsKey) {
            updated = addParamsPropToExistingDestructure(updated, localeParam);
        }
        else if (canReuseExistingParams && !detection.hasParamsType) {
            updated = ensureLocaleInParamsType(updated, localeParam);
        }
        updated = insertLocaleParamsBody(updated, localeParam, detection.hasInlineDestructure);
        if (updated === source) {
            reports.push({ file, action: 'needs-manual-edit' });
            continue;
        }
        updated = ensureSetLocaleImport(updated);
        writeFile(file, updated);
        reports.push({ file, action: 'added-locale-params' });
    }
    if (options.verbose) {
        const pageLabelStyle = typeof options.verbose === 'object' ? options.verbose.pageLabel : undefined;
        const pageLabel = makePageLabeler(options.appDir, pageLabelStyle, displayPath);
        logReports(reports, options.appDir, pageLabel);
    }
    return reports;
}

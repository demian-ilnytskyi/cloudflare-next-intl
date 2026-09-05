import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { detectLocaleParams } from './detect_locale_params.js';
import { insertLocaleParamsSignature, insertLocaleParamsBody, ensureLocaleInParamsType, addParamsPropToExistingDestructure, ensureSetLocaleImport } from './insert_locale_params.js';
import { findLocaleScopedFiles } from './find_locale_scoped_files.js';
import { deriveRoute, makePageLabeler, type PageLabelStyle } from '../dynamic_pages_check/derive_page_label.js';

/** `'off'` — don't scan at all. `'report'` — scan and say what would change, write nothing. `'fix'` — scan and write the missing setup into each qualifying file. */
export type LocaleParamsCheckMode = 'off' | 'report' | 'fix';

export interface CheckLocaleParamsOptions {
    /** Root directory to scan recursively — typically your Next.js `app/` directory. */
    appDir: string;
    /** Defaults to `'report'`. */
    mode?: LocaleParamsCheckMode;
    /**
     * Defaults to `'locale'`. The dynamic segment name your `[locale]`-style
     * folder uses (e.g. `'lang'` for a `[lang]` folder) — only files whose
     * path starts with `appDir/[<localeParam>]/` are scanned.
     */
    localeParam?: string;
    /**
     * File paths (as returned by `findLocaleScopedFiles` — i.e. joined with
     * `appDir`) to leave completely alone: not read, not written, not
     * reported as anything but `'skipped'`. Use this for a page whose
     * locale setup is deliberately different from the default (reads it
     * from a parent layout, uses its own resolution logic, ...).
     */
    skip?: readonly string[];
    /**
     * Per-file overrides, keyed by the same file path `skip` uses. Lets one
     * unusual page opt into a different `localeParam` than the rest of the
     * scan — e.g. a single `[lang]`-named route living inside an otherwise
     * `[locale]`-named tree — without changing the default for every other
     * file.
     */
    overrides?: Readonly<Record<string, { localeParam?: string }>>;
    /**
     * Defaults to `false` — nothing is printed. `true` logs a block per
     * scanned file: its label, route, and the reason it was (or wasn't)
     * given locale-param setup — e.g. "missing setup, zero-arg signature"
     * vs "already resolves locale via setLocaleAsync(params)" vs "existing
     * params shape not recognized, left for manual edit". Mirrors
     * `checkDynamicPages`'s `verbose` option. Pass `{ pageLabel: ... }`
     * instead of `true` to change how each file's own label is displayed —
     * see `checkDynamicPages`'s `verbose` option for the same styles.
     */
    verbose?: boolean | { pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string) };
}

export interface CheckLocaleParamsReport {
    file: string;
    action:
        | 'added-locale-params'
        | 'would-add-locale-params'
        | 'already-set-up'
        | 'needs-manual-edit'
        | 'skipped';
}

export interface CheckLocaleParamsIo {
    findLocaleScopedFiles?: (appDir: string, localeParam: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
}

const ZERO_ARG_DEFAULT_EXPORT = /export\s+default\s+(async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(\s*\)/;

const LEGEND = '✓ Set up   + Added   ? Needs manual edit   · Skipped';

function actionGlyph(action: CheckLocaleParamsReport['action']): string {
    switch (action) {
        case 'added-locale-params': return '+';
        case 'would-add-locale-params': return '+';
        case 'already-set-up': return '✓';
        case 'needs-manual-edit': return '?';
        case 'skipped': return '·';
    }
}

function actionDetail(action: CheckLocaleParamsReport['action']): string {
    switch (action) {
        case 'added-locale-params': return 'Missing locale-param setup — added it';
        case 'would-add-locale-params': return 'Missing locale-param setup — would add it';
        case 'already-set-up': return 'Already resolves locale from params (setLocaleAsync/setLocale)';
        case 'needs-manual-edit': return 'Existing params shape not recognized — needs a manual edit';
        case 'skipped': return 'Skipped — excluded from this scan';
    }
}

/** Path as typed in an editor's "go to file" box, not an absolute one nobody can scan. */
function displayPath(file: string): string {
    const rel = relative(process.cwd(), file);
    return rel === '' || rel.startsWith('..') ? file : rel;
}

/**
 * The file's own kind — `page`, `layout`, or `loading` — read off its
 * basename. A `page.tsx` and a `loading.tsx` in the same folder derive the
 * identical route AND the identical human label, so two rows would
 * otherwise be indistinguishable in the log.
 */
function fileKind(file: string): string {
    const match = /([a-z]+)\.(?:tsx|ts|jsx|js)$/.exec(file);
    return match ? match[1]! : file;
}

function logReports(
    reports: readonly CheckLocaleParamsReport[],
    appDir: string,
    pageLabel: (file: string) => string,
): void {
    console.log(`[cloudflare-next-intl] locale-params check\n${LEGEND}\n`);
    reports.forEach((report, index) => {
        const isLast = index === reports.length - 1;
        const branch = isLast ? '└' : '├';
        const kind = fileKind(report.file);
        const route = deriveRoute(appDir, report.file) + (kind === 'page' || kind === 'route' ? '' : `/${kind}`);
        console.log(`${branch} ${actionGlyph(report.action)} ${route}  ${pageLabel(report.file)} [${kind}]  — ${actionDetail(report.action)}`);
    });
}

/**
 * Scans `[<localeParam>]`-scoped `page.*`/`layout.*`/`loading.*` files and,
 * for every one missing locale-param setup, inserts it:
 *
 * - a zero-argument default export gets `{ params }: { params:
 *   Promise<{ <localeParam>: Language }> }` added to its signature, plus
 *   `const { <localeParam> } = await params; setLocale(<localeParam>);` as
 *   the first statement of its body;
 * - a default export that already destructures a plain `{ params }` prop
 *   (alone or alongside other props, e.g. `{ children, params }`) — with
 *   nothing else in the file already binding `<localeParam>` — is left
 *   alone at the signature level and REUSES that existing prop: `const {
 *   <localeParam> } = await params; setLocale(<localeParam>);` is added as
 *   the body's first statement (or just `setLocale(<localeParam>)`, if the
 *   file already has an equivalent inline `const { <localeParam> } = await
 *   params` and only needs the `setLocale` call, never a duplicate `await
 *   params`);
 * - a file already calling `setLocaleAsync(params)` (or an inline
 *   destructure paired with its own `setLocale` call) is `'already-set-up'`;
 * - anything else — an arrow function, a non-destructured or ALIASED
 *   `params` (`{ params: routeParams }`), multiple top-level params, or
 *   (most importantly) a `params` prop that already resolves
 *   `<localeParam>` some OTHER way this scan doesn't recognize (a ternary
 *   default, a spread, a helper call — detected as `<localeParam>` already
 *   being a declared binding somewhere in the file) — is
 *   `'needs-manual-edit'` without being written. This is deliberately
 *   conservative: inserting a second, blind `const { <localeParam> } =
 *   await params` next to existing custom logic risks a duplicate
 *   declaration, so any shape this scan can't fully account for is left for
 *   a human rather than risking broken output.
 *
 * Each returned report's `file` also appears in `skip` verbatim if you want
 * a specific page/layout left untouched on a later run, or in `overrides`
 * to scan it under a different `localeParam`.
 */
export async function checkLocaleParams(
    options: CheckLocaleParamsOptions,
    io: CheckLocaleParamsIo = {},
): Promise<CheckLocaleParamsReport[]> {
    const mode = options.mode ?? 'report';
    if (mode === 'off') return [];
    const defaultLocaleParam = options.localeParam ?? 'locale';

    const findFiles = io.findLocaleScopedFiles ?? findLocaleScopedFiles;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const skipSet = new Set(options.skip ?? []);
    const overrides = options.overrides ?? {};

    const reports: CheckLocaleParamsReport[] = [];
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
        // Safe to write when: there's a zero-arg signature to extend; OR an
        // inline destructure to hang a `setLocale(...)` call off of; OR the
        // signature already destructures a plain `{ params }` prop AND
        // nothing else in the file already binds `<localeParam>` (so a
        // fresh `const { <localeParam> } = await params` can't collide with
        // existing logic); OR the signature destructures some OTHER props
        // object with no `params` key at all (a plain inline type this scan
        // can safely extend), in which case `params` is added as an
        // additional key/property rather than assumed to exist. Anything
        // else — an arrow function, a non-destructured/aliased `params`, a
        // wrapped type (`Readonly<{...}>`) this scan won't extend, or a
        // `params` prop that resolves locale some OTHER way this scan
        // doesn't recognize (spread, `?? default`, conditional, ...) — is
        // NOT safe: blindly inserting a fresh declaration would risk
        // colliding with existing logic (e.g. a duplicate `const locale`),
        // so it's left for a human instead.
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

        let updated = source;
        if (isZeroArg) {
            updated = insertLocaleParamsSignature(updated, localeParam);
        } else if (canAddParamsKey) {
            updated = addParamsPropToExistingDestructure(updated, localeParam);
        } else if (canReuseExistingParams && !detection.hasParamsType) {
            // Reusing an existing `{ params }` prop whose type doesn't
            // mention `<localeParam>` yet (e.g. `Promise<{ ownerId: string
            // }>` on a route with more than one dynamic segment) — widen
            // the type first so the destructure this is about to insert
            // reads a key that's actually declared, not `undefined`.
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

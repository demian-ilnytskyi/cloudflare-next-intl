import { readFileSync, writeFileSync } from 'node:fs';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage } from './detect_dynamic_usage.js';
import { insertDynamicExport } from './insert_dynamic_export.js';

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
    /** File paths (as returned by `findPageFiles` — i.e. joined with `appDir`) to leave completely alone: not read, not written, not reported as anything but `'skipped'`. */
    skip?: readonly string[];
}

export interface CheckDynamicPagesReport {
    file: string;
    action: 'added-force-dynamic' | 'would-add-force-dynamic' | 'already-declared' | 'no-dynamic-usage-detected' | 'skipped';
}

export interface CheckDynamicPagesIo {
    findPageFiles?: (appDir: string) => string[];
    readFile?: (file: string) => string;
    writeFile?: (file: string, contents: string) => void;
}

export async function checkDynamicPages(
    options: CheckDynamicPagesOptions,
    io: CheckDynamicPagesIo = {},
): Promise<CheckDynamicPagesReport[]> {
    const mode = options.mode ?? 'report';
    if (mode === 'off') return [];

    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file: string) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file: string, contents: string) => writeFileSync(file, contents, 'utf8'));
    const skipSet = new Set(options.skip ?? []);

    const reports: CheckDynamicPagesReport[] = [];
    for (const file of findPageFiles(options.appDir)) {
        if (skipSet.has(file)) {
            reports.push({ file, action: 'skipped' });
            continue;
        }

        const source = readFile(file);
        const detection = detectDynamicUsage(source);
        if (detection.hasExplicitDynamicExport) {
            reports.push({ file, action: 'already-declared' });
            continue;
        }
        // A page with no detected dynamic-API usage is left to Next's own
        // static/dynamic inference — inserting `force-static` here would be
        // an unsafe default (a page can be dynamic through means this
        // regex-based scan doesn't see), whereas doing nothing never turns
        // a working dynamic page into a stale, build-time-frozen one.
        if (detection.detectedDynamicApis.length === 0) {
            reports.push({ file, action: 'no-dynamic-usage-detected' });
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

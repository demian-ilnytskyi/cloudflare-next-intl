import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findPageFiles as findPageFilesImpl } from './find_page_files.js';
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';
import { collectReachableFiles } from './collect_reachable_files.js';
import { findReportErrorCalls } from './find_report_error_calls.js';
function defaultIsFile(path) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
function isConfirmedDynamic(source, reachableApis, target) {
    const explicit = readExplicitDynamicValue(source);
    if (explicit !== null)
        return explicit === 'force-dynamic';
    if (target === 'vinext')
        return reachableApis.length > 0;
    return false;
}
export async function syncErrorReportingAuthUser(options, io = {}) {
    const mode = options.mode ?? 'report';
    if (mode === 'off')
        return [];
    const target = options.target ?? 'next';
    const findPageFiles = io.findPageFiles ?? findPageFilesImpl;
    const readFile = io.readFile ?? ((file) => readFileSync(file, 'utf8'));
    const writeFile = io.writeFile ?? ((file, contents) => writeFileSync(file, contents, 'utf8'));
    const isFile = io.isFile ?? defaultIsFile;
    const skipSet = new Set(options.skip ?? []);
    const aliases = options.aliases ?? [
        { prefix: '@/', replacement: resolve(options.appDir, '..') },
    ];
    const dynamicReachable = new Set();
    const notConfirmedReachable = new Set();
    const fileSources = new Map();
    for (const page of findPageFiles(options.appDir)) {
        if (skipSet.has(page))
            continue;
        const source = readFile(page);
        const files = collectReachableFiles(page, source, aliases, { readFile, isFile });
        const apis = new Set();
        for (const [file, fileSource] of files) {
            fileSources.set(file, fileSource);
            detectDynamicUsage(fileSource).detectedDynamicApis.forEach((api) => apis.add(api));
        }
        const bucket = isConfirmedDynamic(source, [...apis], target) ? dynamicReachable : notConfirmedReachable;
        for (const file of files.keys())
            bucket.add(file);
    }
    const safeFiles = [...dynamicReachable].filter((file) => !notConfirmedReachable.has(file));
    const reports = [];
    for (const file of safeFiles) {
        const source = fileSources.get(file);
        const calls = findReportErrorCalls(source).filter((call) => call.insertPos !== null && !call.hasExplicitUseAuthUser);
        if (calls.length === 0)
            continue;
        if (mode === 'fix') {
            let rewritten = source;
            for (const call of [...calls].sort((a, b) => b.insertPos - a.insertPos)) {
                rewritten = `${rewritten.slice(0, call.insertPos)}useAuthUser: true, ${rewritten.slice(call.insertPos)}`;
            }
            writeFile(file, rewritten);
            reports.push({ file, action: 'added-use-auth-user', callCount: calls.length });
        }
        else {
            reports.push({ file, action: 'would-add-use-auth-user', callCount: calls.length });
        }
    }
    return reports;
}

import { detectDynamicUsage } from './detect_dynamic_usage.js';
import { collectReachableFiles } from './collect_reachable_files.js';
export function traceDynamicUsage(entryFile, entrySource, aliases, io, extraChecks = []) {
    const files = collectReachableFiles(entryFile, entrySource, aliases, io);
    let hasExplicitDynamicExport = false;
    const detectedApis = new Set();
    const signals = [];
    let first = true;
    for (const [file, source] of files.entries()) {
        const detection = detectDynamicUsage(source, extraChecks);
        if (first) {
            hasExplicitDynamicExport = detection.hasExplicitDynamicExport;
            first = false;
        }
        detection.matches.forEach(({ name, line }) => {
            detectedApis.add(name);
            signals.push({ api: name, file, line });
        });
    }
    return {
        hasExplicitDynamicExport,
        detectedDynamicApis: [...detectedApis],
        matches: signals.map(({ api, line }) => ({ name: api, line })),
        signals,
    };
}

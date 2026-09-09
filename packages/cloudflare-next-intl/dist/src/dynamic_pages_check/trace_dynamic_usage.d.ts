import { type DynamicApiCheck, type DynamicDetectionResult } from './detect_dynamic_usage.js';
import { type CollectReachableFilesIo } from './collect_reachable_files.js';
import type { AliasConfig } from './resolve_local_imports.js';
export type TraceDynamicUsageIo = CollectReachableFilesIo;
export interface DynamicSignal {
    api: string;
    file: string;
    line: number;
}
export interface TraceDynamicUsageResult extends DynamicDetectionResult {
    signals: DynamicSignal[];
}
export declare function traceDynamicUsage(entryFile: string, entrySource: string, aliases: readonly AliasConfig[], io: TraceDynamicUsageIo, extraChecks?: readonly DynamicApiCheck[]): TraceDynamicUsageResult;

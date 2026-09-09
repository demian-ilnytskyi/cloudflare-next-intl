import { type AliasConfig } from './resolve_local_imports.js';
export interface CollectReachableFilesIo {
    readFile: (file: string) => string;
    isFile?: (file: string) => boolean;
}
export declare const MAX_FILES_VISITED = 300;
export declare function collectReachableFiles(entryFile: string, entrySource: string, aliases: readonly AliasConfig[], io: CollectReachableFilesIo): Map<string, string>;

export interface InstallExecFile {
    sourcePath: string;
    targetPath: string;
}
export interface InstallExecOutcome {
    targetPath: string;
    action: 'created' | 'updated' | 'unchanged' | 'skipped-differs' | 'skipped-missing-source';
    message: string;
}
export declare function installExecFile(file: InstallExecFile, force: boolean): InstallExecOutcome;

export interface InstallExecFile {
    /** Absolute path to the file this package ships (e.g. `supabase/cfni_exec.sql`). */
    sourcePath: string;
    /** Absolute path to copy it to in the consuming project. */
    targetPath: string;
}
export interface InstallExecOutcome {
    targetPath: string;
    action: 'created' | 'updated' | 'unchanged' | 'skipped-differs' | 'skipped-missing-source';
    message: string;
}
/**
 * Copies one packaged SQL file (`cfni_exec.sql` itself, or its pgTAP test
 * file) to a target path in the consuming project, creating the target
 * directory if needed.
 *
 * When the target already exists with different content, this skips the
 * write and reports `'skipped-differs'` rather than overwriting a possibly
 * customized file — pass `force: true` to overwrite anyway.
 *
 * @param file Source (this package's copy) and target (the project's copy) paths.
 * @param force Overwrite an existing, differing target instead of skipping it.
 */
export declare function installExecFile(file: InstallExecFile, force: boolean): InstallExecOutcome;

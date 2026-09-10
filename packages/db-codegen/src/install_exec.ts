import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
export function installExecFile(file: InstallExecFile, force: boolean): InstallExecOutcome {
    if (!existsSync(file.sourcePath)) {
        return {
            targetPath: file.targetPath,
            action: 'skipped-missing-source',
            message: `source file not found at ${file.sourcePath}`,
        };
    }

    const sourceContent = readFileSync(file.sourcePath, 'utf-8');

    if (existsSync(file.targetPath)) {
        const targetContent = readFileSync(file.targetPath, 'utf-8');
        if (targetContent === sourceContent) {
            return { targetPath: file.targetPath, action: 'unchanged', message: 'already up to date' };
        }
        if (!force) {
            return {
                targetPath: file.targetPath,
                action: 'skipped-differs',
                message: `${file.targetPath} already exists with different content — pass --force to overwrite`,
            };
        }
        writeFileSync(file.targetPath, sourceContent);
        return { targetPath: file.targetPath, action: 'updated', message: 'overwritten with --force' };
    }

    mkdirSync(dirname(file.targetPath), { recursive: true });
    writeFileSync(file.targetPath, sourceContent);
    return { targetPath: file.targetPath, action: 'created', message: 'created' };
}

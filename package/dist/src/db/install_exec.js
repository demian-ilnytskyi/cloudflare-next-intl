import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function installExecFile(file, force) {
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

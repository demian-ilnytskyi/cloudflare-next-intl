import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installExecFile } from './install_exec.js';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfni-install-exec-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('installExecFile', () => {
    it('reports skipped-missing-source when the packaged file is absent', () => {
        const result = installExecFile({ sourcePath: join(dir, 'missing.sql'), targetPath: join(dir, 'out/target.sql') }, false);
        expect(result.action).toBe('skipped-missing-source');
    });

    it('creates the target and its directory when neither exists', () => {
        const sourcePath = join(dir, 'source.sql');
        writeFileSync(sourcePath, 'select 1;');
        const targetPath = join(dir, 'nested/dir/target.sql');

        const result = installExecFile({ sourcePath, targetPath }, false);

        expect(result.action).toBe('created');
        expect(readFileSync(targetPath, 'utf-8')).toBe('select 1;');
    });

    it('reports unchanged when the target already matches', () => {
        const sourcePath = join(dir, 'source.sql');
        writeFileSync(sourcePath, 'select 1;');
        const targetPath = join(dir, 'target.sql');
        writeFileSync(targetPath, 'select 1;');

        const result = installExecFile({ sourcePath, targetPath }, false);

        expect(result.action).toBe('unchanged');
    });

    it('skips a differing target without force', () => {
        const sourcePath = join(dir, 'source.sql');
        writeFileSync(sourcePath, 'select 1;');
        const targetPath = join(dir, 'target.sql');
        writeFileSync(targetPath, 'select 2; -- customized');

        const result = installExecFile({ sourcePath, targetPath }, false);

        expect(result.action).toBe('skipped-differs');
        expect(readFileSync(targetPath, 'utf-8')).toBe('select 2; -- customized');
    });

    it('overwrites a differing target with force', () => {
        const sourcePath = join(dir, 'source.sql');
        writeFileSync(sourcePath, 'select 1;');
        const targetPath = join(dir, 'target.sql');
        writeFileSync(targetPath, 'select 2; -- customized');

        const result = installExecFile({ sourcePath, targetPath }, true);

        expect(result.action).toBe('updated');
        expect(readFileSync(targetPath, 'utf-8')).toBe('select 1;');
    });

    it('creates the target directory only if missing', () => {
        const sourcePath = join(dir, 'source.sql');
        writeFileSync(sourcePath, 'select 1;');
        mkdirSync(join(dir, 'existing'), { recursive: true });
        const targetPath = join(dir, 'existing/target.sql');

        const result = installExecFile({ sourcePath, targetPath }, false);

        expect(result.action).toBe('created');
    });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore
import { orderedSqlFiles } from '../bin/ddl_order.mjs';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfni-ddl-order-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('orderedSqlFiles', () => {
    it('returns empty array for empty directory', () => {
        expect(orderedSqlFiles(dir)).toEqual([]);
    });

    it('sorts alphabetically when no order.txt exists', () => {
        writeFileSync(join(dir, 'b.sql'), 'select 2;');
        writeFileSync(join(dir, 'a.sql'), 'select 1;');
        writeFileSync(join(dir, 'c.sql'), 'select 3;');

        expect(orderedSqlFiles(dir)).toEqual([
            join(dir, 'a.sql'),
            join(dir, 'b.sql'),
            join(dir, 'c.sql'),
        ]);
    });

    it('respects order.txt and appends unlisted files alphabetically', () => {
        writeFileSync(join(dir, 'z.sql'), 'select z;');
        writeFileSync(join(dir, 'b.sql'), 'select b;');
        writeFileSync(join(dir, 'a.sql'), 'select a;');
        writeFileSync(join(dir, 'm.sql'), 'select m;');

        writeFileSync(join(dir, 'order.txt'), 'z.sql\na.sql\n');

        expect(orderedSqlFiles(dir)).toEqual([
            join(dir, 'z.sql'),
            join(dir, 'a.sql'),
            join(dir, 'b.sql'),
            join(dir, 'm.sql'),
        ]);
    });

    it('handles nested directories and their respective order.txt files', () => {
        const ciDir = join(dir, 'ci');
        const configDir = join(dir, 'config');
        const tablesDir = join(dir, 'tables');
        mkdirSync(ciDir);
        mkdirSync(configDir);
        mkdirSync(tablesDir);

        writeFileSync(join(ciDir, 'set_up.sql'), 'setup');
        writeFileSync(join(configDir, 'b_config.sql'), 'b');
        writeFileSync(join(configDir, 'a_config.sql'), 'a');
        writeFileSync(join(configDir, 'order.txt'), 'b_config.sql\na_config.sql\n');
        writeFileSync(join(tablesDir, 'users.sql'), 'users');

        writeFileSync(join(dir, 'order.txt'), 'ci\nconfig\n');

        expect(orderedSqlFiles(dir)).toEqual([
            join(ciDir, 'set_up.sql'),
            join(configDir, 'b_config.sql'),
            join(configDir, 'a_config.sql'),
            join(tablesDir, 'users.sql'),
        ]);
    });

    it('handles trailing slashes, comments, and whitespace in order.txt without duplicating entries', () => {
        const ciDir = join(dir, 'ci');
        mkdirSync(ciDir);
        writeFileSync(join(ciDir, 'set_up.sql'), 'setup');
        writeFileSync(join(dir, 'order.txt'), '# comment\n  ci/  \n\n');

        expect(orderedSqlFiles(dir)).toEqual([
            join(ciDir, 'set_up.sql'),
        ]);
    });
});

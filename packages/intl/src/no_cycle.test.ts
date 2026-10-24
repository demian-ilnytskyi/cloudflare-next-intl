import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = __dirname;

function getAllTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = resolve(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            files.push(...getAllTsFiles(fullPath));
        } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('no_cycle.test.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

describe('no cycle', () => {
    it('core never imports optional modules', () => {
        const files = getAllTsFiles(srcDir);
        const bannedImportPattern = /(?:from\s+['"][^'"]*(?:firebase_auth|cookie_consent|\/db\/|cloudflare-next-intl-(?:auth|db)|cloudflare-next-intl['"/])|import\(\s*['"][^'"]*(?:firebase_auth|cookie_consent|\/db\/|cloudflare-next-intl-(?:auth|db)|cloudflare-next-intl['"/]))/;

        const violations: string[] = [];
        for (const file of files) {
            const content = readFileSync(file, 'utf8');
            if (bannedImportPattern.test(content)) {
                violations.push(file);
            }
        }

        expect(violations).toEqual([]);
    });
});

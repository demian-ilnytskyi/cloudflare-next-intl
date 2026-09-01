import { describe, it, expect } from 'vitest';
import { extractImportSpecifiers, resolveLocalImport } from './resolve_local_imports.js';

describe('extractImportSpecifiers', () => {
    it('extracts named, default, and namespace import specifiers', () => {
        const source = `
import { cookies } from "next/headers";
import Foo from "./foo";
import * as Bar from "../bar";
import "./side_effect_only";
`;
        expect(extractImportSpecifiers(source)).toEqual([
            'next/headers',
            './foo',
            '../bar',
            './side_effect_only',
        ]);
    });

    it('extracts re-export specifiers', () => {
        const source = `export { fetchAuditDraft } from "./audit_draft_repository";`;
        expect(extractImportSpecifiers(source)).toEqual(['./audit_draft_repository']);
    });

    it('returns an empty array when there are no imports', () => {
        expect(extractImportSpecifiers('export default function Page() {}')).toEqual([]);
    });
});

describe('resolveLocalImport', () => {
    const isFile = (file: string) => new Set([
        '/repo/src/app/audit/audit_content.tsx',
        '/repo/src/app/audit/accessible_property_repository.ts',
        '/repo/src/shared/utils/require_flavour.ts',
    ]).has(file);

    it('resolves a relative specifier with an implicit extension', () => {
        const resolved = resolveLocalImport(
            './audit_content',
            '/repo/src/app/audit/page.tsx',
            [],
            isFile,
        );
        expect(resolved).toBe('/repo/src/app/audit/audit_content.tsx');
    });

    it('resolves an alias-prefixed specifier', () => {
        const resolved = resolveLocalImport(
            '@/shared/utils/require_flavour',
            '/repo/src/app/audit/page.tsx',
            [{ prefix: '@/', replacement: '/repo/src/' }],
            isFile,
        );
        expect(resolved).toBe('/repo/src/shared/utils/require_flavour.ts');
    });

    it('returns null for a bare package specifier with no matching alias', () => {
        const resolved = resolveLocalImport('next/headers', '/repo/src/app/audit/page.tsx', [], isFile);
        expect(resolved).toBeNull();
    });

    it('returns null when no candidate extension resolves to a real file', () => {
        const resolved = resolveLocalImport('./does_not_exist', '/repo/src/app/audit/page.tsx', [], isFile);
        expect(resolved).toBeNull();
    });

    it('falls back to an index file when the specifier resolves to a directory', () => {
        const isFileWithIndex = (file: string) => file === '/repo/src/app/audit/index.ts';
        const resolved = resolveLocalImport('./audit', '/repo/src/app/page.tsx', [], isFileWithIndex);
        expect(resolved).toBe('/repo/src/app/audit/index.ts');
    });
});

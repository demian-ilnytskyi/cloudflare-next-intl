import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { extractImportBindings, extractImportSpecifiers, resolveLocalImport } from './resolve_local_imports.js';

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

describe('extractImportBindings', () => {
    it('reads a default import\'s binding', () => {
        const [entry] = extractImportBindings('import Foo from "./foo";');
        expect(entry).toMatchObject({ specifier: './foo', bindings: ['Foo'], alwaysFollow: false });
    });

    it('reads a named import\'s binding', () => {
        const [entry] = extractImportBindings('import { getAuthUser } from "./auth";');
        expect(entry).toMatchObject({ specifier: './auth', bindings: ['getAuthUser'], alwaysFollow: false });
    });

    it('reads a renamed named import by its LOCAL alias, not the original name', () => {
        const [entry] = extractImportBindings('import { getAuthUser as gau } from "./auth";');
        expect(entry).toMatchObject({ specifier: './auth', bindings: ['gau'] });
    });

    it('reads multiple named bindings', () => {
        const [entry] = extractImportBindings('import { a, b, c as d } from "./x";');
        expect(entry).toMatchObject({ bindings: ['a', 'b', 'd'] });
    });

    it('ignores an empty item created by a trailing comma in named bindings', () => {
        const [entry] = extractImportBindings('import { a, b, } from "./x";');
        expect(entry).toMatchObject({ bindings: ['a', 'b'] });
    });

    it('reads a namespace import\'s binding', () => {
        const [entry] = extractImportBindings('import * as auth from "./auth";');
        expect(entry).toMatchObject({ specifier: './auth', bindings: ['auth'] });
    });

    it('reads both halves of a combined default + named import', () => {
        const [entry] = extractImportBindings('import Default, { a, b } from "./x";');
        expect(entry.bindings.sort()).toEqual(['Default', 'a', 'b']);
    });

    it('marks a bare side-effect import alwaysFollow with no bindings', () => {
        const [entry] = extractImportBindings('import "./polyfill";');
        expect(entry).toMatchObject({ specifier: './polyfill', bindings: [], alwaysFollow: true });
    });

    it('marks a named re-export alwaysFollow with no local bindings to check', () => {
        const [entry] = extractImportBindings('export { fetchThing } from "./repo";');
        expect(entry).toMatchObject({ specifier: './repo', bindings: [], alwaysFollow: true });
    });

    it('marks export * from alwaysFollow', () => {
        const [entry] = extractImportBindings('export * from "./repo";');
        expect(entry).toMatchObject({ specifier: './repo', bindings: [], alwaysFollow: true });
    });

    it('skips an import type statement entirely — a type never executes, so there is nothing to trace', () => {
        expect(extractImportBindings('import type { Foo } from "./types";')).toEqual([]);
    });

    it('does not choke on an inline "type" modifier inside a named-import list', () => {
        const [entry] = extractImportBindings('import { type Foo, bar } from "./x";');
        expect(entry.bindings).toContain('bar');
    });

    it('returns one entry per statement for a file with several imports', () => {
        const source = 'import { cookies } from "next/headers";\nimport Foo from "./foo";\nimport * as Bar from "../bar";\nimport "./side_effect_only";\n';
        const specifiers = extractImportBindings(source).map((e) => e.specifier);
        expect(specifiers).toEqual(['next/headers', './foo', '../bar', './side_effect_only']);
    });

    it('returns an empty array with no imports at all', () => {
        expect(extractImportBindings('export default function Page() {}')).toEqual([]);
    });

    it('reports start/end offsets spanning exactly the statement text', () => {
        const source = 'const x = 1;\nimport { a } from "./a";\nconst y = 2;';
        const [entry] = extractImportBindings(source);
        expect(source.slice(entry.start, entry.end)).toBe('import { a } from "./a"');
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

    it('resolves a specifier that already carries its own extension without appending another', () => {
        const resolved = resolveLocalImport(
            './audit_content.tsx',
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

    describe('with the real filesystem (no isFile override)', () => {
        it('resolves a relative specifier to a real sibling file', () => {
            const resolved = resolveLocalImport('./detect_dynamic_usage', __filename, []);
            expect(resolved).toBe(join(__dirname, 'detect_dynamic_usage.ts'));
        });

        it('returns null for a relative specifier with no real file behind it', () => {
            const resolved = resolveLocalImport('./definitely_does_not_exist_xyz', __filename, []);
            expect(resolved).toBeNull();
        });
    });
});

import { describe, it, expect } from 'vitest';
import { insertDynamicExport } from './insert_dynamic_export.js';

describe('insertDynamicExport', () => {
    it('inserts after the last top-level import, with a marker comment', () => {
        const source = `import Link from "next/link";\nimport { requireErrorsAccess } from "./gate";\n\nexport default function Page() {}\n`;
        const result = insertDynamicExport(source, 'force-static');
        expect(result).toContain('import { requireErrorsAccess } from "./gate";\n\n// Auto-inserted by cloudflare-next-intl\'s checkDynamicPages');
        expect(result).toContain('export const dynamic = "force-static";');
        expect(result.indexOf('export const dynamic')).toBeLessThan(result.indexOf('export default function Page'));
    });

    it('inserts at the top of the file when there are no imports', () => {
        const source = `export default function Page() {}\n`;
        const result = insertDynamicExport(source, 'force-dynamic');
        expect(result.startsWith("// Auto-inserted by cloudflare-next-intl's checkDynamicPages")).toBe(true);
        expect(result).toContain('export const dynamic = "force-dynamic";');
        expect(result.indexOf('export const dynamic')).toBeLessThan(result.indexOf('export default function Page'));
    });
});

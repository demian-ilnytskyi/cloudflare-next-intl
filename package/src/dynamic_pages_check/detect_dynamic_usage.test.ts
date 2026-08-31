import { describe, it, expect } from 'vitest';
import { detectDynamicUsage } from './detect_dynamic_usage.js';

describe('detectDynamicUsage', () => {
    it('finds no explicit export and no dynamic APIs in a plain static page', () => {
        const result = detectDynamicUsage(`export default function Page() { return <div>hi</div>; }`);
        expect(result.hasExplicitDynamicExport).toBe(false);
        expect(result.detectedDynamicApis).toEqual([]);
    });

    it('detects an existing export const dynamic', () => {
        const result = detectDynamicUsage(`export const dynamic = "force-dynamic";\nexport default function Page() {}`);
        expect(result.hasExplicitDynamicExport).toBe(true);
    });

    it('detects cookies()/headers() usage from next/headers', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\nasync function f() { await cookies(); }`);
        expect(result.detectedDynamicApis).toContain('cookies()');
    });

    it('detects a searchParams prop', () => {
        const result = detectDynamicUsage(`export default async function Page({ searchParams }) {}`);
        expect(result.detectedDynamicApis).toContain('searchParams');
    });

    it('detects unstable_noStore()', () => {
        const result = detectDynamicUsage(`import { unstable_noStore } from "next/cache";\nunstable_noStore();`);
        expect(result.detectedDynamicApis).toContain('unstable_noStore()');
    });

    it('detects cache: "no-store" fetch options', () => {
        const result = detectDynamicUsage(`fetch(url, { cache: "no-store" });`);
        expect(result.detectedDynamicApis).toContain('cache: "no-store"');
    });

    it('deduplicates repeated matches of the same API', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\ncookies(); cookies(); cookies();`);
        expect(result.detectedDynamicApis.filter((a) => a === 'cookies()')).toHaveLength(1);
    });
});

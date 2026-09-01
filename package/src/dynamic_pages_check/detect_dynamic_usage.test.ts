import { describe, it, expect } from 'vitest';
import { detectDynamicUsage, readExplicitDynamicValue } from './detect_dynamic_usage.js';

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

    it('detects getAuthUser() as a dynamic signal (it wraps cookies())', () => {
        const result = detectDynamicUsage(
            `import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";\nasync function f() { const { user } = await getAuthUser(); }`
        );
        expect(result.detectedDynamicApis).toContain('getAuthUser()');
    });

    it('detects useAuthUser() as a dynamic signal', () => {
        const result = detectDynamicUsage(
            `import useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";\nasync function f() { await useAuthUser(); }`
        );
        expect(result.detectedDynamicApis).toContain('useAuthUser()');
    });

    it('detects withUserDb() as a dynamic signal (it resolves uid via getAuthUser()/cookies internally)', () => {
        const result = detectDynamicUsage(
            `import { withUserDb } from "cloudflare-next-intl/db";\nasync function f() { return withUserDb((db) => db.select().from(table)); }`
        );
        expect(result.detectedDynamicApis).toContain('withUserDb()');
    });

    it('deduplicates repeated matches of the same API', () => {
        const result = detectDynamicUsage(`import { cookies } from "next/headers";\ncookies(); cookies(); cookies();`);
        expect(result.detectedDynamicApis.filter((a) => a === 'cookies()')).toHaveLength(1);
    });
});

describe('readExplicitDynamicValue', () => {
    it('reads a force-dynamic export', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "force-dynamic";`)).toBe('force-dynamic');
    });

    it('reads a force-static export with single quotes', () => {
        expect(readExplicitDynamicValue(`export const dynamic = 'force-static';`)).toBe('force-static');
    });

    it('reads auto and error', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "auto";`)).toBe('auto');
        expect(readExplicitDynamicValue(`export const dynamic = "error";`)).toBe('error');
    });

    it('returns null when there is no explicit export', () => {
        expect(readExplicitDynamicValue(`export default function Page() {}`)).toBeNull();
    });

    it('returns null for an unrecognized literal value', () => {
        expect(readExplicitDynamicValue(`export const dynamic = "not-a-real-value";`)).toBeNull();
    });
});

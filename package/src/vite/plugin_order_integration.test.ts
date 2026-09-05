import { describe, it, expect } from 'vitest';
import { checkLocaleParams } from '../locale_params_check/check_locale_params.js';
import { checkDynamicPages } from '../dynamic_pages_check/check_dynamic_pages.js';

const APP_DIR = '/app';

/**
 * Reproduces the real bug: a `loading.tsx` with `getTranslations()` and no
 * `setLocale` call is genuinely cookie-dependent — but once
 * `checkLocaleParams` (running first, per `plugin.ts`'s registration order)
 * inserts `setLocale`, the SAME file re-scanned by `checkDynamicPages` must
 * no longer report that signal. Running the two checks in the wrong order
 * (dynamic-pages before locale-params) is exactly what produced the false
 * positive this test guards against.
 */
describe('autoLocaleParams before autoDynamicPages (plugin.ts registration order)', () => {
    it('a page missing setLocale is flagged dynamic on its own', async () => {
        const source = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function Loading() {\n    const t = await getTranslations('PropertyIntake');\n    return null;\n}\n`;
        const reports = await checkDynamicPages(
            { appDir: APP_DIR, mode: 'report', target: 'vinext' },
            { findPageFiles: () => ['/app/[locale]/property-profile/loading.tsx'], readFile: () => source },
        );
        expect(reports[0]!.action).toBe('would-add-force-dynamic');
        expect(reports[0]!.signals?.some((s) => s.api.includes('cookie-derived locale'))).toBe(true);
    });

    it('the same page, after checkLocaleParams fixes it first, is no longer flagged dynamic for that reason', async () => {
        const original = `import { getTranslations } from "cloudflare-next-intl";\nexport default async function Loading() {\n    const t = await getTranslations('PropertyIntake');\n    return null;\n}\n`;
        let stored = original;

        await checkLocaleParams(
            { appDir: APP_DIR, mode: 'fix' },
            {
                findLocaleScopedFiles: () => ['/app/[locale]/property-profile/loading.tsx'],
                readFile: () => stored,
                writeFile: (_file, contents) => { stored = contents; },
            },
        );
        expect(stored).toContain('setLocale(locale)');

        const reports = await checkDynamicPages(
            { appDir: APP_DIR, mode: 'report', target: 'vinext' },
            { findPageFiles: () => ['/app/[locale]/property-profile/loading.tsx'], readFile: () => stored },
        );
        expect(reports[0]!.action).toBe('would-add-force-static');
        expect(reports[0]!.signals ?? []).toEqual([]);
    });
});

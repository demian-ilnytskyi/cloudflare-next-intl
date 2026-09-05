import { describe, it, expect, vi } from 'vitest';
import { sep } from 'node:path';
import { findLocaleScopedFiles } from './find_locale_scoped_files.js';
import * as findPageFilesModule from '../dynamic_pages_check/find_page_files.js';

const APP_DIR = '/app';

describe('findLocaleScopedFiles', () => {
    it('keeps only files under appDir/[locale]/, dropping route.* and unrelated dynamic segments', () => {
        vi.spyOn(findPageFilesModule, 'findPageFiles').mockReturnValue([
            `${APP_DIR}${sep}[locale]${sep}page.tsx`,
            `${APP_DIR}${sep}[locale]${sep}(app)${sep}property-profile${sep}loading.tsx`,
            `${APP_DIR}${sep}[locale]${sep}layout.tsx`,
            `${APP_DIR}${sep}api${sep}[locale]${sep}route.ts`,
            `${APP_DIR}${sep}[ownerId]${sep}page.tsx`,
        ]);
        const result = findLocaleScopedFiles(APP_DIR, 'locale');
        expect(result).toEqual([
            `${APP_DIR}${sep}[locale]${sep}page.tsx`,
            `${APP_DIR}${sep}[locale]${sep}(app)${sep}property-profile${sep}loading.tsx`,
            `${APP_DIR}${sep}[locale]${sep}layout.tsx`,
        ]);
        vi.restoreAllMocks();
    });

    it('respects a custom localeParam name', () => {
        vi.spyOn(findPageFilesModule, 'findPageFiles').mockReturnValue([
            `${APP_DIR}${sep}[lang]${sep}page.tsx`,
            `${APP_DIR}${sep}[locale]${sep}page.tsx`,
        ]);
        expect(findLocaleScopedFiles(APP_DIR, 'lang')).toEqual([`${APP_DIR}${sep}[lang]${sep}page.tsx`]);
        vi.restoreAllMocks();
    });

    it('excludes route.* files (API routes never render locale-scoped UI)', () => {
        vi.spyOn(findPageFilesModule, 'findPageFiles').mockReturnValue([`${APP_DIR}${sep}[locale]${sep}route.ts`]);
        expect(findLocaleScopedFiles(APP_DIR, 'locale')).toEqual([]);
        vi.restoreAllMocks();
    });
});

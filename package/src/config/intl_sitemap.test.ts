import { describe, it, expect } from 'vitest';
import generateIntlSitemap from './intl_sitemap';
import type { IntlSitemap } from '../types/types';

describe('generateIntlSitemap', () => {
    it('generates one sitemap entry per locale per route, sorted by URL', () => {
        const routes: IntlSitemap[] = [
            { link: '/about', lastModified: '2024-01-01' },
        ];
        const result = generateIntlSitemap({ intlSitemap: routes, url: 'https://example.com' });

        expect(result).toHaveLength(2);
        expect(result.map((r) => r.url)).toEqual([
            'https://example.com/about',
            'https://example.com/de/about',
        ]);
    });

    it('treats "/" link as root, without duplicating the path', () => {
        const routes: IntlSitemap[] = [{ link: '/', lastModified: '2024-01-01' }];
        const result = generateIntlSitemap({ intlSitemap: routes, url: 'https://example.com' });

        expect(result.map((r) => r.url)).toEqual([
            'https://example.com',
            'https://example.com/de',
        ]);
    });

    it('attaches alternates languages to every entry', () => {
        const routes: IntlSitemap[] = [{ link: '/about', lastModified: '2024-01-01' }];
        const result = generateIntlSitemap({ intlSitemap: routes, url: 'https://example.com' });

        expect(result[0].alternates?.languages).toMatchObject({
            'x-default': 'https://example.com/about',
        });
    });
});

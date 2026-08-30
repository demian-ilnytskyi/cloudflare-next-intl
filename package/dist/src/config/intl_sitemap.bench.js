import { bench, describe } from 'vitest';
import generateIntlSitemap from './intl_sitemap.js';
const smallRoutes = [
    { link: '/about', lastModified: '2024-01-01' },
    { link: '/contact', lastModified: '2024-01-01' },
];
const largeRoutes = Array.from({ length: 100 }, (_, i) => ({
    link: `/route-${i}`,
    lastModified: '2024-01-01',
}));
describe('generateIntlSitemap', () => {
    bench('small site: 2 routes x 2 locales', () => {
        generateIntlSitemap({ intlSitemap: smallRoutes, url: `https://example.com/${Math.random()}` });
    });
    bench('large site: 100 routes x 2 locales', () => {
        generateIntlSitemap({ intlSitemap: largeRoutes, url: `https://example.com/${Math.random()}` });
    });
});

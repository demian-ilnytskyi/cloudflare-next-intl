import type { MetadataRoute } from 'next';
import type { IntlSitemap } from '../types/types';
declare function generateIntlSitemapIml({ intlSitemap, url }: {
    intlSitemap: IntlSitemap[];
    url: string;
}): MetadataRoute.Sitemap;
declare const generateIntlSitemap: typeof generateIntlSitemapIml;
export default generateIntlSitemap;

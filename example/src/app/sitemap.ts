import KTextConstants from "@/shared/constants/variables/text_constants";
import type { MetadataRoute } from "next";
import type { IntlSitemap } from "cloudflare-next-intl";
import { generateIntlSitemap } from "cloudflare-next-intl";

const lastModified = new Date(2025, 5, 29);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const intlSitemap: IntlSitemap[] = [
    {
      changeFrequency: "monthly",
      priority: 1,
      lastModified: lastModified,
    },
  ];

  return generateIntlSitemap({ intlSitemap, url: KTextConstants.baseUrl });
}

import type { Metadata } from "next";
import KTextConstants from "../constants/variables/text_constants";
import {
  alternatesLinks,
  type TranslatorReturnType,
} from "cloudflare-next-intl";

interface MetadataHelperProps {
  t: TranslatorReturnType;
  locale: Language;
  isMain?: boolean;
  canonical?: string;
  linkPart: string;
}

export default function metadataHelper({
  t,
  isMain = false,
  linkPart,
  locale,
  canonical,
}: MetadataHelperProps): Partial<Metadata> {
  return {
    title: isMain
      ? {
        default: t("title.default"),
        template: t("title.template"),
      }
      : t("title"),
    description: t("description"),
    alternates: alternatesLinks({
      url: KTextConstants.baseUrl,
      locale,
      linkPart,
      canonical,
    }),
  };
}

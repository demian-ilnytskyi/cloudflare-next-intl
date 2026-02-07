import type { Metadata } from "next";
import NavigationBar from "@/shared/components/nav_bar/nav_bar";
import { cn } from "@/lib/utils";
import metadataHelper from "@/shared/helpers/metadata_helper";
import {
  getLocaleStaticParams,
  getTranslations,
  IntlHelperScript,
} from "cloudflare-next-intl";
import { IntlProvider } from "cloudflare-next-intl";
import KTextConstants from "@/shared/constants/variables/text_constants";

export async function generateMetadata({ params }: {
  params: Promise<{ locale: Language }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("Metadata.Main", locale);

  return {
    ...metadataHelper({
      isMain: true,
      t: t,
      linkPart: "",
      locale: locale,
    }),
    category: t("category"),
    manifest: `/${locale}/manifest.json`,
    other: {
      "Content-Language": locale,
    },
  };
}

export const generateStaticParams = getLocaleStaticParams;

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>): Promise<Component> {
  const result = await params;
  const locale = result?.locale ?? KTextConstants.defaultLocale;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Language" content={locale} />
        <IntlHelperScript />
      </head>
      <body
        className={cn(`bg-white dark:bg-gray-900`)}
      >
        <IntlProvider language={locale}>
          <div className="flex flex-col min-h-screen mx-4 lg:mx-24 tablet:mx-8 self-center ease-out">
            <NavigationBar />
            {children}
          </div>
        </IntlProvider>
      </body>
    </html>
  );
}

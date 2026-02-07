import type { Metadata } from "next";
import NotFound, { generateMetadata as notFoundGenerateMetadata } from "./[locale]/not-found";
import RootLayout from "./[locale]/layout";
import KTextConstants from "@/shared/constants/variables/text_constants";

export async function generateMetadata(): Promise<Metadata> {
  const locale = KTextConstants.defaultLocale;
  return notFoundGenerateMetadata({ params: Promise.resolve({ locale }) });
};

export default function GlobalNotFound(): Component {
  const locale = KTextConstants.defaultLocale;
  return <RootLayout params={Promise.resolve({ locale })}>
    <NotFound params={Promise.resolve({ locale })} />
  </RootLayout>
}

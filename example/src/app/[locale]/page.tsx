import AppTextStyle from "@/shared/constants/styles/app_text_styles";
import { getTranslations, Link, setLocaleAsync } from "cloudflare-next-intl";

export default async function Home({ params }: {
  params: Promise<{ locale: Language }>;
}): Promise<Component> {
  await setLocaleAsync(params);
  const t = await getTranslations("HomePage");

  return (
    <main className="flex-1 flex flex-col mt-5">
      <Link href="/#test" className={AppTextStyle.h1}>Test</Link>
      <h1 className={AppTextStyle.h1}>{t("title")}</h1>
      <h2 className={AppTextStyle.h1Mob}>{t("description")}</h2>
    </main>
  );
}

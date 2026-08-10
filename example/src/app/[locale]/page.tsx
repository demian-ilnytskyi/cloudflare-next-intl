import AppTextStyle from "@/shared/constants/styles/app_text_styles";
import { getTranslations, setLocaleAsync } from "cloudflare-next-intl";
import { getAuthUser } from "cloudflare-next-intl/getFirebaseAuthUser";
import ClientUserEmail from "@/shared/components/nav_bar/client_user_email";

export default async function Home({ params }: {
  params: Promise<{ locale: Language }>;
}): Promise<Component> {
  await setLocaleAsync(params);
  const t = await getTranslations("HomePage");
  const { user } = await getAuthUser();

  return (
    <main className="flex-1 flex flex-col mt-5">
      {new Date().toISOString()}
      <h1 className={AppTextStyle.h1}>{t("title")}</h1>
      <h2 className={AppTextStyle.h1Mob}>{t("description")}</h2>
      <p>Server email: {user?.email ?? "not signed in"}</p>
      <ClientUserEmail />
    </main>
  );
}

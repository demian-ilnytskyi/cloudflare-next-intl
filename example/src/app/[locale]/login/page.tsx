import { getTranslations } from "cloudflare-next-intl";
import LoginForm from "./login_form";

export default async function LoginPage({ params }: {
    params: Promise<{ locale: Language }>;
}): Promise<Component> {
    const { locale } = await params;
    const t = await getTranslations("LoginPage", locale);

    return (
        <main className="flex-1 flex flex-col items-center justify-center mt-5">
            <h1 className="text-2xl mb-6">{t("title")}</h1>
            <LoginForm
                locale={locale}
                emailLabel={t("email")}
                passwordLabel={t("password")}
                submitLabel={t("submit")}
            />
        </main>
    );
}

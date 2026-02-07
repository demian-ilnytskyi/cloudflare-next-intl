import { getTranslations, setLocaleAsync } from "cloudflare-next-intl";

// Example if not use setLocale or setLocaleAsync
export default async function Home({ params }: {
    params: Promise<{ locale: Language }>;
}): Promise<Component> {
    await setLocaleAsync(params);
    const t = await getTranslations("HomePage");
    const list: string[] = t("list");

    return (
        <main className="flex-1 flex flex-col mt-5">
            <ul>
                {list.map((item) => <li key={item}>{item}</li>)}
            </ul>
        </main>
    );
}

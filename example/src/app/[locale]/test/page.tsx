import { getMessage, setLocaleAsync } from "cloudflare-next-intl";

// Example if not use setLocale or setLocaleAsync
export default async function Home({ params }: {
    params: Promise<{ locale: Language }>;
}): Promise<Component> {
    const { locale } = await params;
    await setLocaleAsync(params);
    // `t()` only resolves string leaves; arrays live in raw messages instead.
    const messages = await getMessage(locale);
    const homePage = messages.HomePage as unknown as { list: string[] };
    const list = homePage.list;

    return (
        <main className="flex-1 flex flex-col mt-5">
            <ul>
                {list.map((item) => <li key={item}>{item}</li>)}
            </ul>
        </main>
    );
}

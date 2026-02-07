import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { getMessage } from "../functions/server";
import type { TranslationObject } from "../../types/types";
import dynamic from "next/dynamic";
import { localesSet } from "../../config/middleware";

const LocationzationClientProvider = dynamic(
    () => import("../../client/components/client_provider"),
);

export default async function LocationzationProvider({ language, messages, children }: { language: string, messages?: TranslationObject, children: React.ReactNode }): Promise<Component> {
    if (!localesSet.has(language)) {
        const { notFound } = await import("next/navigation");
        notFound();
    }

    if (language) {
        setLocaleCache(language);
    }
    if (messages) {
        setMessageForLocaleCache(language, messages);
    }
    const messagesValue = messages ?? await getMessage(language);

    return <LocationzationClientProvider language={language} messages={messagesValue}>
        {children}
    </LocationzationClientProvider>
}
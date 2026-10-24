import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { getMessage } from "../functions/server.js";
import type { TranslationObject } from "../../types/types.js";
import { Suspense } from "react";
import dynamic from "next/dynamic.js";
import { localesSet } from "../../config/middleware.js";
import config from "../../config/intl_config.js";
import pickClientMessages from "../../general/pick_client_messages.js";

const LocationzationClientProvider = dynamic(
    () => import("../../client/components/client_provider_static.js"),
);

export default async function LocationzationProvider({
    language,
    messages,
    children,
}: {
    language: string;
    messages?: TranslationObject;
    children: React.ReactNode;
}): Promise<React.JSX.Element> {
    if (!localesSet.has(language)) {
        const { notFound } = await import("next/navigation.js");
        notFound();
    }

    if (language) {
        setLocaleCache(language);
    }
    if (messages) {
        setMessageForLocaleCache(language, messages);
    }
    const messagesValue = pickClientMessages(messages ?? await getMessage(language), config.clientMessages);

    return (
        <Suspense fallback={children}>
            <LocationzationClientProvider
                language={language}
                messages={messagesValue}
            >
                {children}
            </LocationzationClientProvider>
        </Suspense>
    );
}

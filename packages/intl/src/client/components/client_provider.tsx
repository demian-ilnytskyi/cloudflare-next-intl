"use client";

import type { TranslationObject } from "../../types/types.js";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { useMemo } from "react";
import config from "../../config/intl_config.js";
import { LocaleContext } from "./locale_provider.js";

export { LocaleContext };

export default function LocationzationClientProvider({
    language,
    messages,
    children,
}: {
    language: string;
    messages: TranslationObject;
    children?: React.ReactNode;
}) {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);

    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);

    return (
        <LocaleContext.Provider value={contextValue}>
            {children}
        </LocaleContext.Provider>
    );
}

"use client";

import type { TranslationObject } from "../../types/types.js";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables.js";
import { useMemo } from "react";
import config from "../../config/intl_config.js";
import installConsoleErrorOverride from "../../error_handling/install_console_error_override.js";
import installGlobalErrorOverride from "../../error_handling/install_global_error_override.js";
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
    installConsoleErrorOverride(config, true);
    installGlobalErrorOverride(config);

    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);

    return (
        <LocaleContext.Provider value={contextValue}>
            {children}
        </LocaleContext.Provider>
    );
}

"use client";

import type { TranslationObject } from "../../types/types";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { createContext, useMemo } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
import type { SerializedAuthUser } from "../../firebase_auth/types";

interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}

export const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export default function LocationzationClientProvider({
    language,
    messages,
    initialAuthUser = null,
    children
}: {
    language: string;
    messages: TranslationObject;
    initialAuthUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): Component {
    setLocaleCache(language);
    setMessageForLocaleCache(language, messages);

    // `LocaleContext.Provider` stays the outermost element here — the
    // client `AuthUserProvider` (and its descendants calling
    // usePathname()/useLocale()) must render as a CHILD of it, not a
    // sibling wrapping it, or those hooks would throw for running outside
    // the provider.
    let providedChildren = children;
    if (config.firebaseAuth) {
        const AuthUserProvider = dynamic(() => import("../../firebase_auth/client/auth_user_provider"));
        providedChildren = <AuthUserProvider initialUser={initialAuthUser}>{children}</AuthUserProvider>;
    }

    const contextValue = useMemo(() => ({ language, messages }), [language, messages]);

    return <LocaleContext.Provider value={contextValue}>
        {providedChildren}
    </LocaleContext.Provider>;
}

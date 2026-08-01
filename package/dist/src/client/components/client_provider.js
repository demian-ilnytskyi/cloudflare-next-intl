"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { setLocaleCache, setMessageForLocaleCache } from "../../general/cache_variables";
import { createContext } from "react";
import dynamic from "next/dynamic";
import config from "@intl-config";
export const LocaleContext = createContext(undefined);
export default function LocationzationClientProvider({ language, messages, initialAuthUser = null, children }) {
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
        providedChildren = _jsx(AuthUserProvider, { initialUser: initialAuthUser, children: children });
    }
    return _jsx(LocaleContext.Provider, { value: { language, messages }, children: providedChildren });
}

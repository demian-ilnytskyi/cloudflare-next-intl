"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { TranslationObject } from "../../types/types.js";

interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}

export const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export default function LocaleProvider({ language, messages, children }: { language: string; messages: TranslationObject; children: ReactNode }): React.JSX.Element {
    const value = useMemo(() => ({ language, messages }), [language, messages]);
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

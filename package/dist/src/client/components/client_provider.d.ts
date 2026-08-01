import type { TranslationObject } from "../../types/types";
import type { SerializedAuthUser } from "../../firebase_auth/types";
interface LocaleContextType {
    language: string;
    messages: TranslationObject;
}
export declare const LocaleContext: import("react").Context<LocaleContextType | undefined>;
export default function LocationzationClientProvider({ language, messages, initialAuthUser, children }: {
    language: string;
    messages: TranslationObject;
    initialAuthUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): Component;
export {};

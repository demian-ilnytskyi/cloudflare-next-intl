import type { TranslationObject } from "../../types/types.js";
export default function LocationzationProvider({ language, messages, staticSafe, children }: {
    language: string;
    messages?: TranslationObject;
    staticSafe?: boolean;
    children: React.ReactNode;
}): Promise<Component>;

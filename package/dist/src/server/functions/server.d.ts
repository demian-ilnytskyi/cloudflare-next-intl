import type { TranslationObject, TranslatorReturnType } from "../../types/types.js";
declare function iGetMessage(locale: string): Promise<TranslationObject>;
export declare const getMessage: typeof iGetMessage;
declare function iGetTranslations(namespace: string, locale?: string): Promise<TranslatorReturnType>;
export declare const getTranslations: typeof iGetTranslations;
declare function iGetLocale(): Promise<string>;
export declare const getLocale: typeof iGetLocale;
export {};

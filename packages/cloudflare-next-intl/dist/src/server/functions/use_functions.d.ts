import type { TranslatorReturnType } from "../../types/types.js";
export declare function useLocaleImpl(): string;
export declare const useLocale: typeof useLocaleImpl;
declare function useTranslationsImpl(namespace: string): TranslatorReturnType;
export declare const useTranslations: typeof useTranslationsImpl;
export {};

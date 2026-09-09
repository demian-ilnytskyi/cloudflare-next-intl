export declare function iAlternatesLinks({ locale, url, canonical, linkPart }: {
    url: string;
    locale: string;
    linkPart?: string;
    canonical?: string;
}): {
    canonical?: string;
    languages: Record<string, string>;
} | undefined;
export declare const alternatesLinks: typeof iAlternatesLinks;
declare function iLanguages(url: string, linkPart?: string): Record<string, string>;
export declare const languages: typeof iLanguages;
export {};

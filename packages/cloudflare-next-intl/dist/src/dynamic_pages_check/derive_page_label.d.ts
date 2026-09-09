export declare function derivePageLabel(appDir: string, file: string): string;
export declare function deriveRoute(appDir: string, file: string): string;
export declare function isApiRoute(file: string): boolean;
export type PageLabelStyle = 'title' | 'path';
export declare function makePageLabeler(appDir: string, style: PageLabelStyle | ((file: string, appDir: string) => string) | undefined, displayPath: (file: string) => string): (file: string) => string;

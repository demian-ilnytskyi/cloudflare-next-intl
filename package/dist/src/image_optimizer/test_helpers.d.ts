export declare function makeTempDir(): Promise<string>;
export declare function cleanup(dir: string): Promise<void>;
export declare function writeFixturePng(dir: string, filename: string, width: number, height: number): Promise<string>;

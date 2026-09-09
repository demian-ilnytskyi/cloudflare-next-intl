export declare function isRecentBuild(setAt: number | null, now: number, windowMs?: number): boolean;
export declare function shouldRecoverFromStaleDeploy(error: unknown, buildId: string, marker: string | null, recentBuild?: boolean, reloadTime?: number | null, now?: number, throttleMs?: number, attempts?: number, maxAttempts?: number): boolean;
export declare function performCacheBustReload(): void;
export default function useStaleDeployRecovery(error: unknown, onRecover?: () => Promise<unknown>, delayMs?: number): boolean;

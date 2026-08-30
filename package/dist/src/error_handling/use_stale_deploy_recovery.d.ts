export declare function isRecentBuild(setAt: number | null, now: number, windowMs?: number): boolean;
export declare function shouldRecoverFromStaleDeploy(error: unknown, buildId: string, marker: string | null, recentBuild?: boolean): boolean;
export default function useStaleDeployRecovery(error: unknown, onRecover?: () => Promise<unknown>, delayMs?: number): boolean;

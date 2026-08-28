/**
 * True when this build id was written within the last `windowMs` — i.e. the
 * client just picked up a new deploy (via `IntlHelperScript`'s BUILD_ID
 * check). A stale-deploy error in that window is the deploy itself still
 * settling (new chunks, in-flight RSC requests against the old build), not a
 * failure a reload can't fix — so it recovers even on a build id the reload
 * marker already covers.
 */
export declare function isRecentBuild(setAt: number | null, now: number, windowMs?: number): boolean;
export declare function shouldRecoverFromStaleDeploy(error: unknown, buildId: string, marker: string | null, recentBuild?: boolean): boolean;
/**
 * Detects a stale-deploy error and, once per build id, silently clears client
 * caches and reloads after `delayMs`. Returns whether a reload is pending so
 * the caller can render a loading state instead of the error UI while it
 * waits. `onRecover` runs before the reload (e.g. to clear server cookies via
 * a server action) and its rejection is ignored — cache clearing is
 * best-effort.
 */
export default function useStaleDeployRecovery(error: unknown, onRecover?: () => Promise<unknown>, delayMs?: number): boolean;

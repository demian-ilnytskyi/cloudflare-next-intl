export declare function shouldRecoverFromStaleDeploy(error: Error, buildId: string, marker: string | null): boolean;
/**
 * Detects a stale-deploy error and, once per build id, silently clears client
 * caches and reloads after `delayMs`. Returns whether a reload is pending so
 * the caller can render a loading state instead of the error UI while it
 * waits. `onRecover` runs before the reload (e.g. to clear server cookies via
 * a server action) and its rejection is ignored — cache clearing is
 * best-effort.
 */
export default function useStaleDeployRecovery(error: Error, onRecover?: () => Promise<unknown>, delayMs?: number): boolean;

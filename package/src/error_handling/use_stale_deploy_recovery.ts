'use client';

import { useEffect, useState } from 'react';
import isStaleDeployError from './is_stale_deploy_error';
import clearClientCache from './clear_client_cache';

const RECOVERY_RELOAD_KEY = 'stale-deploy-recovery-reloaded';
const BUILD_ID_KEY = 'buildId';

function currentBuildId(): string {
    try {
        return localStorage.getItem(BUILD_ID_KEY) ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

// One silent reload per deployment. The marker carries the build id the reload
// was spent on, so a redeploy re-arms exactly one more attempt while a repeat
// failure on the same build falls through to the caller's error UI instead of
// spinning forever.
export function shouldRecoverFromStaleDeploy(error: Error, buildId: string, marker: string | null): boolean {
    return isStaleDeployError(error) && marker !== buildId;
}

function canRecover(error: Error): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return shouldRecoverFromStaleDeploy(error, currentBuildId(), sessionStorage.getItem(RECOVERY_RELOAD_KEY));
    } catch {
        return false;
    }
}

/**
 * Detects a stale-deploy error and, once per build id, silently clears client
 * caches and reloads after `delayMs`. Returns whether a reload is pending so
 * the caller can render a loading state instead of the error UI while it
 * waits. `onRecover` runs before the reload (e.g. to clear server cookies via
 * a server action) and its rejection is ignored — cache clearing is
 * best-effort.
 */
export default function useStaleDeployRecovery(
    error: Error,
    onRecover?: () => Promise<unknown>,
    delayMs = 5000,
): boolean {
    const [recovering] = useState(() => canRecover(error));

    useEffect(() => {
        if (!recovering) return;

        const buildId = currentBuildId();
        const timeout = setTimeout(() => {
            Promise.all([onRecover?.().catch(() => undefined), clearClientCache().catch(() => undefined)])
                .finally(() => {
                    try {
                        sessionStorage.setItem(RECOVERY_RELOAD_KEY, buildId);
                    } catch { /* storage unavailable */ }
                    window.location.reload();
                });
        }, delayMs);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recovering]);

    return recovering;
}

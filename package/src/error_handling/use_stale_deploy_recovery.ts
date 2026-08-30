'use client';

import { useEffect, useState } from 'react';
import isStaleDeployError from './is_stale_deploy_error.js';
import clearClientCache from './clear_client_cache.js';

const RECOVERY_RELOAD_KEY = 'stale-deploy-recovery-reloaded';
const BUILD_ID_KEY = 'buildId';
const BUILD_ID_SET_AT_KEY = 'buildIdSetAt';
const RECENT_BUILD_WINDOW_MS = 60_000;

function currentBuildId(): string {
    try {
        return localStorage.getItem(BUILD_ID_KEY) ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

function buildIdSetAt(): number | null {
    try {
        const raw = localStorage.getItem(BUILD_ID_SET_AT_KEY);
        return raw ? Number(raw) : null;
    } catch {
        return null;
    }
}

/**
 * True when this build id was written within the last `windowMs` — i.e. the
 * client just picked up a new deploy (via `IntlHelperScript`'s BUILD_ID
 * check). A stale-deploy error in that window is the deploy itself still
 * settling (new chunks, in-flight RSC requests against the old build), not a
 * failure a reload can't fix — so it recovers even on a build id the reload
 * marker already covers.
 */
export function isRecentBuild(setAt: number | null, now: number, windowMs = RECENT_BUILD_WINDOW_MS): boolean {
    return setAt !== null && now - setAt < windowMs;
}

// One silent reload per deployment, UNLESS the build id was written moments
// ago — see `isRecentBuild`. The marker carries the build id the reload was
// spent on, so a redeploy re-arms exactly one more attempt while a repeat
// failure well after the deploy settled falls through to the caller's error
// UI instead of spinning forever.
export function shouldRecoverFromStaleDeploy(
    error: unknown,
    buildId: string,
    marker: string | null,
    recentBuild = false,
): boolean {
    return isStaleDeployError(error) && (marker !== buildId || recentBuild);
}

function canRecover(error: unknown): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return shouldRecoverFromStaleDeploy(
            error,
            currentBuildId(),
            sessionStorage.getItem(RECOVERY_RELOAD_KEY),
            isRecentBuild(buildIdSetAt(), Date.now()),
        );
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
    error: unknown,
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

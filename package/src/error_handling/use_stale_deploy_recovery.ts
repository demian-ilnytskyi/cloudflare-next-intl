'use client';

import { useEffect, useState } from 'react';
import isStaleDeployError from './is_stale_deploy_error.js';
import clearClientCache from './clear_client_cache.js';

const RECOVERY_RELOAD_KEY = 'stale-deploy-recovery-reloaded';
const RECOVERY_TIME_KEY = 'stale-deploy-recovery-time';
const BUILD_ID_KEY = 'buildId';
const BUILD_ID_SET_AT_KEY = 'buildIdSetAt';
const RECENT_BUILD_WINDOW_MS = 60_000;
const RELOAD_THROTTLE_MS = 15_000;

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
 * check).
 */
export function isRecentBuild(setAt: number | null, now: number, windowMs = RECENT_BUILD_WINDOW_MS): boolean {
    return setAt !== null && now - setAt < windowMs;
}

/**
 * Determines whether a stale deploy error should trigger a recovery reload.
 * Throttles reloads for the same build ID to once per `throttleMs` (15s) to prevent
 * rapid infinite reload loops, while ensuring fresh HTML is fetched.
 */
export function shouldRecoverFromStaleDeploy(
    error: unknown,
    buildId: string,
    marker: string | null,
    recentBuild = false,
    reloadTime: number | null = null,
    now: number = Date.now(),
    throttleMs = RELOAD_THROTTLE_MS,
): boolean {
    if (!isStaleDeployError(error)) return false;

    const isRecentlyReloaded = reloadTime !== null && now - reloadTime < throttleMs;
    const isSameBuildMarker = marker !== null && marker !== '' && (buildId === 'unknown' || marker === buildId);

    if (isSameBuildMarker && isRecentlyReloaded && !recentBuild) {
        return false;
    }

    return true;
}

function canRecover(error: unknown): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const reloadTimeRaw = sessionStorage.getItem(RECOVERY_TIME_KEY);
        const reloadTime = reloadTimeRaw ? Number(reloadTimeRaw) : null;
        return shouldRecoverFromStaleDeploy(
            error,
            currentBuildId(),
            sessionStorage.getItem(RECOVERY_RELOAD_KEY),
            isRecentBuild(buildIdSetAt(), Date.now()),
            reloadTime,
            Date.now(),
        );
    } catch {
        return false;
    }
}

export function performCacheBustReload(): void {
    if (typeof window === 'undefined') return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('_stale_reload', String(Date.now()));
        window.location.replace(url.toString());
    } catch {
        window.location.reload();
    }
}

/**
 * Detects a stale-deploy error and, once per build id (throttled to 15s), silently clears client
 * caches and reloads with cache-busting after `delayMs`. Returns whether a reload is pending so
 * the caller can render a loading state instead of the error UI while it
 * waits. `onRecover` runs before the reload (e.g. to clear server cookies via
 * a server action) and its rejection is ignored — cache clearing is
 * best-effort.
 */
export default function useStaleDeployRecovery(
    error: unknown,
    onRecover?: () => Promise<unknown>,
    delayMs = 1000,
): boolean {
    const [recovering] = useState(() => canRecover(error));
    const [initialOnRecover] = useState(() => onRecover);
    const [initialDelayMs] = useState(() => delayMs);

    useEffect(() => {
        if (!recovering) return;

        const buildId = currentBuildId();
        const timeout = setTimeout(() => {
            Promise.all([initialOnRecover?.().catch(() => undefined), clearClientCache().catch(() => undefined)])
                .finally(() => {
                    try {
                        sessionStorage.setItem(RECOVERY_RELOAD_KEY, buildId);
                        sessionStorage.setItem(RECOVERY_TIME_KEY, String(Date.now()));
                    } catch { /* storage unavailable */ }
                    performCacheBustReload();
                });
        }, initialDelayMs);
        return () => clearTimeout(timeout);
    }, [recovering, initialOnRecover, initialDelayMs]);

    return recovering;
}

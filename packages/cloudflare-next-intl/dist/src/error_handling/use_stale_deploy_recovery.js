'use client';
import { useEffect, useState } from 'react';
import isStaleDeployError from './is_stale_deploy_error.js';
import clearClientCache from './clear_client_cache.js';
const RECOVERY_RELOAD_KEY = 'stale-deploy-recovery-reloaded';
const RECOVERY_TIME_KEY = 'stale-deploy-recovery-time';
const RECOVERY_COUNT_KEY = 'stale-deploy-recovery-count';
const MAX_RECOVERY_ATTEMPTS = 2;
const BUILD_ID_KEY = 'buildId';
const BUILD_ID_SET_AT_KEY = 'buildIdSetAt';
const RECENT_BUILD_WINDOW_MS = 60000;
const RELOAD_THROTTLE_MS = 1000;
function currentBuildId() {
    try {
        return localStorage.getItem(BUILD_ID_KEY) ?? 'unknown';
    }
    catch {
        return 'unknown';
    }
}
function buildIdSetAt() {
    try {
        const raw = localStorage.getItem(BUILD_ID_SET_AT_KEY);
        return raw ? Number(raw) : null;
    }
    catch {
        return null;
    }
}
export function isRecentBuild(setAt, now, windowMs = RECENT_BUILD_WINDOW_MS) {
    return setAt !== null && now - setAt < windowMs;
}
export function shouldRecoverFromStaleDeploy(error, buildId, marker, recentBuild = false, reloadTime = null, now = Date.now(), throttleMs = RELOAD_THROTTLE_MS, attempts = 0, maxAttempts = MAX_RECOVERY_ATTEMPTS) {
    if (!isStaleDeployError(error))
        return false;
    const isRecentlyReloaded = reloadTime !== null && now - reloadTime < throttleMs;
    const isSameBuildMarker = marker !== null && marker !== '' && (buildId === 'unknown' || marker === buildId);
    if (isSameBuildMarker && attempts >= maxAttempts) {
        return false;
    }
    if (isSameBuildMarker && isRecentlyReloaded && !recentBuild) {
        return false;
    }
    return true;
}
function currentAttempts(buildId, marker) {
    if (marker === null || marker === '')
        return 0;
    if (buildId !== 'unknown' && marker !== buildId)
        return 0;
    try {
        const raw = sessionStorage.getItem(RECOVERY_COUNT_KEY);
        const parsed = raw ? Number(raw) : 0;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    catch {
        return 0;
    }
}
function canRecover(error) {
    if (typeof window === 'undefined')
        return false;
    try {
        const reloadTimeRaw = sessionStorage.getItem(RECOVERY_TIME_KEY);
        const reloadTime = reloadTimeRaw ? Number(reloadTimeRaw) : null;
        const bId = currentBuildId();
        const marker = sessionStorage.getItem(RECOVERY_RELOAD_KEY);
        const isRecent = isRecentBuild(buildIdSetAt(), Date.now());
        const isStale = isStaleDeployError(error);
        const attempts = currentAttempts(bId, marker);
        const result = shouldRecoverFromStaleDeploy(error, bId, marker, isRecent, reloadTime, Date.now(), RELOAD_THROTTLE_MS, attempts);
        console.warn('[useStaleDeployRecovery]', {
            error,
            isStale,
            bId,
            marker,
            isRecent,
            reloadTime,
            attempts,
            result,
        });
        return result;
    }
    catch (e) {
        console.error('[useStaleDeployRecovery] Error in canRecover:', e);
        return false;
    }
}
export function performCacheBustReload() {
    if (typeof window === 'undefined')
        return;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('_stale_reload', String(Date.now()));
        window.location.replace(url.toString());
    }
    catch {
        window.location.reload();
    }
}
export default function useStaleDeployRecovery(error, onRecover, delayMs = 1000) {
    const [recovering] = useState(() => canRecover(error));
    const [initialOnRecover] = useState(() => onRecover);
    const [initialDelayMs] = useState(() => delayMs);
    useEffect(() => {
        if (!recovering)
            return;
        const buildId = currentBuildId();
        const timeout = setTimeout(() => {
            Promise.all([initialOnRecover?.().catch(() => undefined), clearClientCache().catch(() => undefined)])
                .finally(() => {
                try {
                    const marker = sessionStorage.getItem(RECOVERY_RELOAD_KEY);
                    const spent = currentAttempts(buildId, marker);
                    sessionStorage.setItem(RECOVERY_RELOAD_KEY, buildId);
                    sessionStorage.setItem(RECOVERY_COUNT_KEY, String(spent + 1));
                    sessionStorage.setItem(RECOVERY_TIME_KEY, String(Date.now()));
                }
                catch { }
                performCacheBustReload();
            });
        }, initialDelayMs);
        return () => clearTimeout(timeout);
    }, [recovering, initialOnRecover, initialDelayMs]);
    return recovering;
}

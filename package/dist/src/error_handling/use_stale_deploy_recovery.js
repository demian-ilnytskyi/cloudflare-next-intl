'use client';
import { useEffect, useState } from 'react';
import isStaleDeployError from './is_stale_deploy_error.js';
import clearClientCache from './clear_client_cache.js';
const RECOVERY_RELOAD_KEY = 'stale-deploy-recovery-reloaded';
const BUILD_ID_KEY = 'buildId';
const BUILD_ID_SET_AT_KEY = 'buildIdSetAt';
const RECENT_BUILD_WINDOW_MS = 60000;
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
export function shouldRecoverFromStaleDeploy(error, buildId, marker, recentBuild = false) {
    return isStaleDeployError(error) && (marker !== buildId || recentBuild);
}
function canRecover(error) {
    if (typeof window === 'undefined')
        return false;
    try {
        return shouldRecoverFromStaleDeploy(error, currentBuildId(), sessionStorage.getItem(RECOVERY_RELOAD_KEY), isRecentBuild(buildIdSetAt(), Date.now()));
    }
    catch {
        return false;
    }
}
export default function useStaleDeployRecovery(error, onRecover, delayMs = 5000) {
    const [recovering] = useState(() => canRecover(error));
    useEffect(() => {
        if (!recovering)
            return;
        const buildId = currentBuildId();
        const timeout = setTimeout(() => {
            Promise.all([onRecover?.().catch(() => undefined), clearClientCache().catch(() => undefined)])
                .finally(() => {
                try {
                    sessionStorage.setItem(RECOVERY_RELOAD_KEY, buildId);
                }
                catch { }
                window.location.reload();
            });
        }, delayMs);
        return () => clearTimeout(timeout);
    }, [recovering]);
    return recovering;
}

import type { User } from '@firebase/auth';
import config from '@intl-config';
import getCookie from 'cloudflare-next-intl-intl/getCookie';
import reportClientError from 'cloudflare-next-intl-errors/reportClientError';
import { defaultSessionMarkerCookieName, DEFAULT_REFRESH_MAX_AGE } from '../cookie_names.js';
import { decodeSessionMarker, refreshTokenHash } from '../session_marker.js';
import syncSessionAction from '../server/sync_session_action.js';
import { getDeviceKey, isDeviceKeyUnsupported } from './device_key.js';

export async function needsSessionSync(
    marker: string | null | undefined,
    refreshToken: string,
    refreshMaxAgeSeconds: number,
    nowSeconds: number,
    bindingEnabled = false,
): Promise<boolean> {
    const decoded = decodeSessionMarker(marker);
    if (!decoded) return true;

    const expectedHash = await refreshTokenHash(refreshToken);
    if (decoded.hash !== expectedHash) return true;

    if (decoded.expiresAt - nowSeconds < 0.2 * refreshMaxAgeSeconds) {
        return true;
    }

    if (bindingEnabled && !decoded.bound && !isDeviceKeyUnsupported()) {
        return true;
    }

    return false;
}

const inFlightSyncs = new Map<string, Promise<void>>();

export function ensureSessionSynced(user: User, devicePublicJwk?: JsonWebKey): Promise<void> {
    let refreshToken: string | undefined;
    try {
        refreshToken = user.refreshToken;
    } catch (e) {
        console.error('ensureSessionSynced: failed to read user.refreshToken', e);
        return Promise.resolve();
    }

    if (!refreshToken) {
        return Promise.resolve();
    }

    const existing = inFlightSyncs.get(refreshToken);
    if (existing) {
        return existing;
    }

    const fa = config.firebaseAuth;
    const markerCookieName = fa?.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;
    const refreshMaxAge = fa?.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE;
    const now = Math.floor(Date.now() / 1000);
    const marker = getCookie(markerCookieName);
    const bindingEnabled = Boolean(fa?.deviceBinding);

    const syncPromise = (async () => {
        try {
            const needed = await needsSessionSync(marker, refreshToken, refreshMaxAge, now, bindingEnabled);
            if (!needed) return;

            let keyJwk = devicePublicJwk;
            if (!keyJwk && bindingEnabled && !isDeviceKeyUnsupported()) {
                const deviceKey = await getDeviceKey(true);
                if (deviceKey) {
                    keyJwk = deviceKey.publicJwk;
                }
            }

            const idToken = await user.getIdToken();
            const res = await syncSessionAction({ idToken, refreshToken, devicePublicJwk: keyJwk });
            if (res.status === 'rejected') {
                console.error('ensureSessionSynced: server rejected session sync');
            } else if (res.status === 'rebind-refused') {
                console.error('ensureSessionSynced: server refused session rebind (old auth_time)');
                if (fa?.onReauthRequired) {
                    await fa.onReauthRequired();
                }
            }
        } catch (e) {
            try {
                await reportClientError(e, 'ensureSessionSynced');
            } catch {
                console.error('ensureSessionSynced: reportClientError failed', e);
            }
        } finally {
            inFlightSyncs.delete(refreshToken);
        }
    })();

    inFlightSyncs.set(refreshToken, syncPromise);
    return syncPromise;
}

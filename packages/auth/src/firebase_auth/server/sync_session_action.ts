"use server";

import { cookies } from "next/headers.js";
import config from "@intl-config";
import reportError from "cloudflare-next-intl-errors/internal/reportError";
import {
    defaultRefreshTokenCookieName,
    defaultSessionCookieName,
    defaultSessionMarkerCookieName,
    DEFAULT_REFRESH_MAX_AGE,
    REBIND_MAX_AUTH_AGE_SECONDS,
} from "../cookie_names.js";
import {
    isIdTokenExpired,
    sessionCookieOptions,
} from "../middleware/update_session.js";
import { encodeSessionMarker } from "../session_marker.js";
import { sha256Hex } from "../device_proof.js";
import { refreshIdToken } from "../refresh_id_token.js";

export interface SyncSessionInput {
    idToken: string;
    refreshToken: string;
    devicePublicJwk?: JsonWebKey;
}

export type SyncSessionResult =
    | { status: 'synced' }
    | { status: 'rejected' }
    | { status: 'rebind-refused' };

function extractAuthTime(idToken: string): number | undefined {
    try {
        const payload = idToken.split('.')[1];
        if (!payload) return undefined;
        const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return typeof json.auth_time === 'number' ? json.auth_time : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Server action: synchronizes the Firebase auth session by setting the HttpOnly
 * session and refresh-token cookies and the client-readable session marker.
 *
 * If deviceBinding is enabled and a devicePublicJwk is supplied, binds the session
 * to the key. If an existing key differs, requires recent auth_time (<= 300s) from a
 * Google-verified ID token to re-bind.
 */
export default async function syncSessionAction(input: SyncSessionInput): Promise<SyncSessionResult> {
    const fa = config.firebaseAuth;
    if (!fa) return { status: 'rejected' };

    if (!input || typeof input.idToken !== 'string' || !input.idToken || typeof input.refreshToken !== 'string' || !input.refreshToken) {
        return { status: 'rejected' };
    }

    if (isIdTokenExpired(input.idToken)) {
        return { status: 'rejected' };
    }

    let isBound = false;
    const binding = fa.deviceBinding;
    if (input.devicePublicJwk && binding) {
        const storeKey = `fa-device:${await sha256Hex(input.refreshToken)}`;
        let existingJwkJson: string | null = null;
        let storeReadFailed = false;
        try {
            existingJwkJson = await binding.store.get(storeKey);
        } catch (e) {
            storeReadFailed = true;
            await reportError(config, { error: e, classOrMethodName: 'syncSessionAction' });
        }

        const newJwkJson = JSON.stringify(input.devicePublicJwk);
        if (storeReadFailed) {
            // Store is unavailable; fail open without mutating or re-binding
            isBound = false;
        } else if (!existingJwkJson) {
            try {
                await binding.store.put(storeKey, newJwkJson);
                isBound = true;
            } catch (e) {
                await reportError(config, { error: e, classOrMethodName: 'syncSessionAction' });
            }
        } else if (existingJwkJson === newJwkJson) {
            isBound = true;
        } else {
            // Existing key is different: re-bind attempt.
            // Verify refresh token with Google to get an unforgeable auth_time claim.
            const refreshRes = await refreshIdToken(fa.apiKey, input.refreshToken, { skipCache: true });
            if (refreshRes.status !== 'refreshed') {
                return { status: 'rebind-refused' };
            }

            const verifiedAuthTime = extractAuthTime(refreshRes.idToken);
            const now = Math.floor(Date.now() / 1000);
            if (verifiedAuthTime !== undefined && (now - verifiedAuthTime) <= REBIND_MAX_AUTH_AGE_SECONDS) {
                try {
                    await binding.store.put(storeKey, newJwkJson);
                    isBound = true;
                } catch (e) {
                    await reportError(config, { error: e, classOrMethodName: 'syncSessionAction' });
                }
            } else {
                return { status: 'rebind-refused' };
            }
        }
    }

    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const sessionMarkerCookieName = fa.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;

    const cookieOptions = sessionCookieOptions(fa, true);
    const markerMaxAge = fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE;
    const markerValue = await encodeSessionMarker(
        Math.floor(Date.now() / 1000) + markerMaxAge,
        input.refreshToken,
        isBound,
    );

    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName, input.idToken, cookieOptions.session as Parameters<typeof cookieStore.set>[2]);
    cookieStore.set(refreshTokenCookieName, input.refreshToken, cookieOptions.refresh as Parameters<typeof cookieStore.set>[2]);
    cookieStore.set(sessionMarkerCookieName, markerValue, {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: markerMaxAge,
    });

    return { status: 'synced' };
}

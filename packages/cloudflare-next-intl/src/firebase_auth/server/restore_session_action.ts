"use server";

import { cookies } from "next/headers.js";
import config from "@intl-config";
import reportError from "../../error_handling/report_error.js";
import {
    defaultRefreshTokenCookieName,
    defaultSessionCookieName,
    defaultSessionMarkerCookieName,
    defaultDeviceProofCookieName,
    DEFAULT_REFRESH_MAX_AGE,
} from "../cookie_names.js";
import {
    sessionCookieOptions,
} from "../middleware/update_session.js";
import { encodeSessionMarker } from "../session_marker.js";
import { guardedRefresh } from "../guarded_refresh.js";
import signServiceAccountJwt from "./sign_service_account_jwt.js";

export type RestoreSessionResult =
    | { status: 'restored'; customToken: string }
    | { status: 'no-session' }
    | { status: 'invalid' }
    | { status: 'unavailable' }
    | { status: 'proof-required' };

function extractUidFromIdToken(token: string): string | undefined {
    try {
        const payload = token.split('.')[1];
        if (!payload) return undefined;
        const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return json.sub || json.user_id;
    } catch {
        return undefined;
    }
}

const IDENTITY_TOOLKIT_AUDIENCE =
    'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

/**
 * Server action: restores a split session where server cookies are present
 * but client-side Firebase Auth state was lost (tab refresh, storage cleared).
 *
 * Checks device proof via guardedRefresh. Exchanges the refresh token for fresh tokens,
 * writes refreshed cookies, and signs a short-lived Firebase custom token so client SDK
 * can authenticate via signInWithCustomToken without interactive user credentials.
 */
export default async function restoreSessionAction(): Promise<RestoreSessionResult> {
    const fa = config.firebaseAuth;
    if (!fa) return { status: 'no-session' };

    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const sessionMarkerCookieName = fa.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;
    const proofCookieName = fa.deviceProofCookieName ?? defaultDeviceProofCookieName;

    try {
        const cookieStore = await cookies();
        const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;
        if (!refreshToken) {
            return { status: 'no-session' };
        }

        const proof = cookieStore.get(proofCookieName)?.value;
        const refreshRes = await guardedRefresh(fa, refreshToken, proof, { skipCache: true });

        if (refreshRes.status === 'proof-required') {
            return { status: 'proof-required' };
        }
        if (refreshRes.status === 'invalid') {
            cookieStore.delete(sessionCookieName);
            cookieStore.delete(refreshTokenCookieName);
            cookieStore.delete(sessionMarkerCookieName);
            return { status: 'invalid' };
        }
        if (refreshRes.status === 'transient-failure') {
            return { status: 'unavailable' };
        }

        const uid = extractUidFromIdToken(refreshRes.idToken);
        if (!uid) {
            await reportError(config, {
                error: new Error('Cannot extract uid from refreshed idToken'),
                classOrMethodName: 'restoreSessionAction',
            });
            return { status: 'unavailable' };
        }

        const cookieOptions = sessionCookieOptions(fa, true);
        const markerMaxAge = fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE;
        const isBound = Boolean(refreshRes.bound);
        const markerValue = await encodeSessionMarker(
            Math.floor(Date.now() / 1000) + markerMaxAge,
            refreshRes.refreshToken,
            isBound,
        );

        cookieStore.set(sessionCookieName, refreshRes.idToken, cookieOptions.session as Parameters<typeof cookieStore.set>[2]);
        cookieStore.set(refreshTokenCookieName, refreshRes.refreshToken, cookieOptions.refresh as Parameters<typeof cookieStore.set>[2]);
        cookieStore.set(sessionMarkerCookieName, markerValue, {
            httpOnly: false,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: markerMaxAge,
        });

        const hasOauthTriple = Boolean(
            fa.appCheck?.oauthClientId && fa.appCheck?.oauthClientSecret && fa.appCheck?.oauthRefreshToken,
        );
        if (!fa.appCheck?.clientEmail || (!fa.appCheck.privateKey && !hasOauthTriple)) {
            await reportError(config, {
                error: new Error('Missing service account credentials to sign custom token for restoreSessionAction'),
                classOrMethodName: 'restoreSessionAction',
            });
            return { status: 'unavailable' };
        }

        const now = Math.floor(Date.now() / 1000);
        const claims = {
            iss: fa.appCheck.clientEmail,
            sub: fa.appCheck.clientEmail,
            aud: IDENTITY_TOOLKIT_AUDIENCE,
            iat: now,
            exp: now + 3600,
            uid,
        };

        const customToken = await signServiceAccountJwt(fa.appCheck, claims);
        return { status: 'restored', customToken };
    } catch (error) {
        await reportError(config, { error, classOrMethodName: 'restoreSessionAction' });
        return { status: 'unavailable' };
    }
}

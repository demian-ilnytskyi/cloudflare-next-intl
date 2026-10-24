"use server";

import { cookies } from "next/headers.js";
import config from "@intl-config";
import reportError from "../../error_handling/report_error.js";
import {
    defaultRefreshTokenCookieName,
    defaultSessionCookieName,
    defaultSessionMarkerCookieName,
    defaultDeviceProofCookieName,
    defaultProofRequiredCookieName,
} from "../cookie_names.js";
import { sha256Hex } from "../device_proof.js";

/**
 * Server action: clears the httpOnly session/refresh-token cookies and the session marker,
 * deletes device proof / proof required cookies, and deletes the device binding if deviceBinding is enabled.
 */
export default async function clearSessionAction(): Promise<void> {
    const fa = config.firebaseAuth;
    if (!fa) return;

    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const sessionMarkerCookieName = fa.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;
    const proofCookieName = fa.deviceProofCookieName ?? defaultDeviceProofCookieName;

    const cookieStore = await cookies();

    if (fa.deviceBinding) {
        const refreshToken = cookieStore.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            try {
                const storeKey = `fa-device:${await sha256Hex(refreshToken)}`;
                await fa.deviceBinding.store.delete(storeKey);
            } catch (error) {
                await reportError(config, { error, classOrMethodName: 'clearSessionAction' });
            }
        }
    }

    cookieStore.delete(sessionCookieName);
    cookieStore.delete(refreshTokenCookieName);
    cookieStore.delete(sessionMarkerCookieName);
    cookieStore.delete(proofCookieName);
    cookieStore.delete(defaultProofRequiredCookieName);
}

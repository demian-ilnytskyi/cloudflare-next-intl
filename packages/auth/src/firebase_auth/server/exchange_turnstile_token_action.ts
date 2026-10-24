"use server";

import config from "@intl-config";
import reportError from "cloudflare-next-intl-intl/internal/reportError";
import decodeJwtPayload from "../decode_jwt_payload.js";
import {
    TURNSTILE_ACTION,
    type TurnstileExchangeResult,
    missingTurnstileSecretReportState,
} from "../turnstile_types.js";
import mintServerAppCheckToken from "./mint_server_app_check_token.js";
import verifyTurnstileToken from "./verify_turnstile_token.js";

/**
 * Server action: verifies a client-provided Cloudflare Turnstile token
 * and exchanges it for a minted Firebase App Check token.
 */
export default async function exchangeTurnstileTokenAction(
    turnstileToken: string,
): Promise<TurnstileExchangeResult> {
    if (typeof turnstileToken !== 'string' || !turnstileToken) {
        return { status: 'unavailable' };
    }

    const appCheck = config.firebaseAuth?.appCheck;
    const secret = appCheck?.turnstileSecretKey;

    if (!secret) {
        if (appCheck?.reportMissingServerCredentials !== false && !missingTurnstileSecretReportState.reported) {
            missingTurnstileSecretReportState.reported = true;
            await reportError(config, {
                error: new Error(
                    'firebaseAuth.appCheck.turnstileSecretKey is required for Turnstile App Check token exchange but is not configured.',
                ),
                classOrMethodName: 'exchangeTurnstileTokenAction',
                dedupKey: 'exchangeTurnstileTokenAction:missing-turnstile-secret',
            });
        }
        return { status: 'unavailable' };
    }

    const verdict = await verifyTurnstileToken(secret, turnstileToken, TURNSTILE_ACTION);
    if (verdict === 'rejected') {
        return { status: 'rejected' };
    }
    if (verdict !== 'ok') {
        return { status: 'unavailable' };
    }

    const projectId = config.firebaseAuth?.projectId ?? '';
    const apiKey = config.firebaseAuth?.apiKey ?? '';
    const appCheckToken = await mintServerAppCheckToken(projectId, apiKey, appCheck);

    if (!appCheckToken) {
        return { status: 'unavailable' };
    }

    const payload = decodeJwtPayload(appCheckToken);
    const expireTimeMillis = typeof payload?.exp === 'number'
        ? payload.exp * 1000
        : Date.now() + 3600 * 1000;

    return {
        status: 'ok',
        token: appCheckToken,
        expireTimeMillis,
    };
}

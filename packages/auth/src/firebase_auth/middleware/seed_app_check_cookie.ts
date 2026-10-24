import type { NextRequest, NextResponse } from 'next/server.js';
import type config from '@intl-config';
import decodeJwtPayload from '../decode_jwt_payload.js';
import mintServerAppCheckToken from '../server/mint_server_app_check_token.js';
import { defaultAppCheckTokenCookieName } from '../cookie_names.js';
import { isPrefetchRequest, isSecureRequest } from './update_session.js';
import { isAppCheckTokenUsable } from '../app_check_token.js';

export { isAppCheckTokenUsable } from '../app_check_token.js';

export default async function seedAppCheckCookie(
    request: NextRequest,
    response: NextResponse,
    fa: NonNullable<typeof config.firebaseAuth>,
): Promise<boolean> {
    if (!fa.appCheck) return false;
    if (isPrefetchRequest(request)) return false;

    const cookieName = fa.appCheckTokenCookieName ?? defaultAppCheckTokenCookieName;
    const existing = request.cookies.get(cookieName)?.value;
    if (isAppCheckTokenUsable(existing)) return false;

    try {
        const token = await mintServerAppCheckToken(fa.projectId, fa.apiKey, fa.appCheck);
        if (!token) return false;

        const decoded = decodeJwtPayload(token);
        const exp = decoded?.exp;
        const nowSeconds = Math.floor(Date.now() / 1000);
        const maxAge = exp ? Math.max(0, exp - nowSeconds - 60) : 3600;

        request.cookies.set(cookieName, token);
        response.cookies.set(cookieName, token, {
            httpOnly: false,
            sameSite: 'lax',
            path: '/',
            secure: isSecureRequest(request),
            maxAge,
        });
        return true;
    } catch {
        // Swallows mint errors
        return false;
    }
}

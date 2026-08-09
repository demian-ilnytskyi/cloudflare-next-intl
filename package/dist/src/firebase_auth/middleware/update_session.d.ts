import { NextResponse, type NextRequest } from 'next/server';
export declare const defaultSessionCookieName = "__fa_session__";
export declare const defaultRefreshTokenCookieName = "__fa_refresh_token__";
export declare const defaultEmailVerifiedHintCookieName = "__fa_email_verified_hint__";
export declare const defaultAppCheckTokenCookieName = "__fa_app_check_token__";
export declare const defaultResetPasswordPath = "/reset-password";
export declare function isIdTokenExpired(token: string): boolean;
export type RefreshResult = {
    status: 'refreshed';
    idToken: string;
    refreshToken: string;
} | {
    status: 'invalid';
} | {
    status: 'transient-failure';
};
/**
 * Mints a fresh ID token from a stored refresh token via Google's Secure
 * Token API. No `firebase/auth` import: this runs in the Edge middleware
 * runtime, and `firebase/auth` pulls in Node-only APIs that break Edge
 * bundles even though this function never touches that module.
 */
export declare function refreshIdToken(apiKey: string, refreshToken: string): Promise<RefreshResult>;
/**
 * Layers Firebase session-cookie validation/refresh and auth redirects onto
 * an already-built middleware response. Called internally by `intlMiddleware`
 * (via dynamic import) when `config.firebaseAuth` is set and
 * `middlewareEnabled !== false` — not intended to be called directly unless
 * that auto-wiring is opted out of.
 *
 * @param baseResponse The response `intlMiddleware` already produced for
 *   locale routing (its own next()/rewrite()/redirect(), with the locale
 *   cookie / bot cookie / `Content-Language` header already set). On the
 *   pass-through path this function returns `baseResponse` itself (with
 *   Firebase cookies layered on) so none of that is dropped; on the
 *   guest/auth-page redirect paths it returns a NEW response instead, since
 *   a redirect response can't also carry forward a rewrite/next decision —
 *   its cookies/headers are copied across from `baseResponse` so locale
 *   state still survives the redirect.
 * @param locale The effective locale `intlMiddleware` resolved for this request.
 */
export default function updateSession(request: NextRequest, baseResponse: NextResponse, locale: string, rebuildResponse?: (request: NextRequest) => NextResponse): Promise<NextResponse>;

import { NextResponse, type NextRequest } from 'next/server';
import config from '@intl-config';
export declare const defaultSessionCookieName = "__fa_session__";
export declare const defaultRefreshTokenCookieName = "__fa_refresh_token__";
export declare const defaultEmailVerifiedHintCookieName = "__fa_email_verified_hint__";
export declare const defaultAppCheckTokenCookieName = "__fa_app_check_token__";
export declare const defaultResetPasswordPath = "/reset-password";
export declare const DEFAULT_SESSION_MAX_AGE: number;
export declare const DEFAULT_REFRESH_MAX_AGE: number;
export declare function sessionCookieOptions(fa: NonNullable<typeof config.firebaseAuth>, secure: boolean): {
    session: Record<string, unknown>;
    refresh: Record<string, unknown>;
};
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
export declare function refreshIdToken(apiKey: string, refreshToken: string, options?: {
    skipCache?: boolean;
}): Promise<RefreshResult>;
export default function updateSession(request: NextRequest, baseResponse: NextResponse, locale: string, rebuildResponse?: (request: NextRequest) => NextResponse): Promise<NextResponse>;

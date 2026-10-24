export const defaultSessionCookieName = '__fa_session__';
export const defaultRefreshTokenCookieName = '__fa_refresh_token__';
export const defaultSessionMarkerCookieName = '__fa_has_session__';
export const defaultAppCheckTokenCookieName = '__fa_app_check_token__';
export const defaultProofRequiredCookieName = '__fa_proof_required__';
export const defaultDeviceProofCookieName = '__fa_device_proof__';
export const defaultEmailVerifiedHintCookieName = '__fa_email_verified_hint__';

export const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Maximum age in seconds of an ID token's auth_time claim to allow
 * re-binding a new device key to an existing refresh token (5 minutes).
 */
export const REBIND_MAX_AUTH_AGE_SECONDS = 300;

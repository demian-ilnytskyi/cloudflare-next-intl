export const TURNSTILE_ACTION = 'fire_app_check';

export type TurnstileExchangeResult =
    | { status: 'ok'; token: string; expireTimeMillis: number }
    | { status: 'rejected' }
    | { status: 'unavailable' };

export const missingTurnstileSecretReportState = { reported: false };

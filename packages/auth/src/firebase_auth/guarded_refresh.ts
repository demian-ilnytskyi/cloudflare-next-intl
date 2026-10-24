import { cookies } from 'next/headers.js';
import type config from '@intl-config';
import { refreshIdToken, type RefreshResult } from './refresh_id_token.js';
import { verifyDeviceProof } from './device_proof.js';
import { defaultProofRequiredCookieName } from './cookie_names.js';

export { defaultProofRequiredCookieName } from './cookie_names.js';

export type GuardedRefreshResult =
    | (RefreshResult & { bound?: boolean })
    | { status: 'proof-required' };

/**
 * Guards Firebase ID token refresh with device proof verification when deviceBinding is configured.
 *
 * If deviceBinding is unset, delegates unconditionally to refreshIdToken.
 * If deviceBinding is set:
 * - 'ok' or 'unbound': refreshes token via refreshIdToken.
 * - 'missing' or 'invalid': returns { status: 'proof-required' } without calling Google.
 */
export async function guardedRefresh(
    fa: NonNullable<typeof config.firebaseAuth>,
    refreshToken: string,
    proof: string | undefined,
    options?: { skipCache?: boolean },
): Promise<GuardedRefreshResult> {
    if (!fa.deviceBinding) {
        return refreshIdToken(fa.apiKey, refreshToken, options);
    }

    const now = Math.floor(Date.now() / 1000);
    const verdict = await verifyDeviceProof(fa.deviceBinding, refreshToken, proof, now);

    if (verdict === 'ok' || verdict === 'unbound') {
        const res = await refreshIdToken(fa.apiKey, refreshToken, options);
        if (res.status === 'refreshed') {
            return {
                ...res,
                bound: verdict === 'ok',
            };
        }
        return res;
    }

    return { status: 'proof-required' };
}

/**
 * Checks whether a device proof is required and pending for the current session.
 * Used server-side so consumers can render a skeleton instead of signed-out UI.
 */
export async function isAuthProofPending(): Promise<boolean> {
    try {
        const cookieStore = await cookies();
        return cookieStore.get(defaultProofRequiredCookieName)?.value === '1';
    } catch {
        return false;
    }
}

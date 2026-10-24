// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mockConfig: { firebaseAuth?: { projectId?: string; apiKey?: string; appCheck?: { turnstileSecretKey?: string; reportMissingServerCredentials?: boolean } } } = {};
vi.mock('@intl-config', () => ({
    get default() {
        return mockConfig;
    },
}));

const reportError = vi.fn(async (..._args: unknown[]) => {});
vi.mock('cloudflare-next-intl-intl/internal/reportError', () => ({
    default: (...args: unknown[]) => reportError(...args),
}));

const verifyTurnstileTokenMock = vi.fn();
vi.mock('./verify_turnstile_token.js', () => ({
    default: (...args: unknown[]) => verifyTurnstileTokenMock(...args),
}));

const mintServerAppCheckTokenMock = vi.fn();
vi.mock('./mint_server_app_check_token.js', () => ({
    default: (...args: unknown[]) => mintServerAppCheckTokenMock(...args),
}));

describe('exchangeTurnstileTokenAction', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockConfig.firebaseAuth = {
            projectId: 'test-proj',
            apiKey: 'test-key',
            appCheck: {
                turnstileSecretKey: 'test-secret',
            },
        };
        const { missingTurnstileSecretReportState } = await import('../turnstile_types.js');
        missingTurnstileSecretReportState.reported = false;
    });

    it('has only default async export', () => {
        const actionPath = path.resolve(__dirname, './exchange_turnstile_token_action.ts');
        const content = fs.readFileSync(actionPath, 'utf8');
        const exportMatches = content.match(/export\s+(?!default\s+async\s+function\s+exchangeTurnstileTokenAction)/g);
        expect(exportMatches).toBeNull();
        expect(content).toMatch(/export\s+default\s+async\s+function\s+exchangeTurnstileTokenAction/);
        expect(content.trim().startsWith('"use server";') || content.trim().startsWith("'use server';")).toBe(true);
    });

    it('returns "unavailable" when turnstileToken is empty or not a string', async () => {
        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');

        expect(await exchangeTurnstileTokenAction('')).toEqual({ status: 'unavailable' });
        // @ts-expect-error testing invalid argument
        expect(await exchangeTurnstileTokenAction(undefined)).toEqual({ status: 'unavailable' });
        // @ts-expect-error testing invalid argument
        expect(await exchangeTurnstileTokenAction(null)).toEqual({ status: 'unavailable' });
        expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
        expect(mintServerAppCheckTokenMock).not.toHaveBeenCalled();
    });

    it('returns "unavailable" and reports error once when turnstileSecretKey is missing', async () => {
        mockConfig.firebaseAuth!.appCheck!.turnstileSecretKey = undefined;

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');

        const res1 = await exchangeTurnstileTokenAction('token-1');
        expect(res1).toEqual({ status: 'unavailable' });
        expect(reportError).toHaveBeenCalledTimes(1);

        const res2 = await exchangeTurnstileTokenAction('token-2');
        expect(res2).toEqual({ status: 'unavailable' });
        expect(reportError).toHaveBeenCalledTimes(1);

        expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
        expect(mintServerAppCheckTokenMock).not.toHaveBeenCalled();
    });

    it('does not report missing secret error if reportMissingServerCredentials is false', async () => {
        mockConfig.firebaseAuth!.appCheck!.turnstileSecretKey = undefined;
        mockConfig.firebaseAuth!.appCheck!.reportMissingServerCredentials = false;

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');
        const res = await exchangeTurnstileTokenAction('token-1');
        expect(res).toEqual({ status: 'unavailable' });
        expect(reportError).not.toHaveBeenCalled();
    });

    it('returns "rejected" when verification fails with "rejected"', async () => {
        verifyTurnstileTokenMock.mockResolvedValueOnce('rejected');

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');
        const res = await exchangeTurnstileTokenAction('bad-token');

        expect(res).toEqual({ status: 'rejected' });
        expect(verifyTurnstileTokenMock).toHaveBeenCalledWith('test-secret', 'bad-token', 'fire_app_check');
        expect(mintServerAppCheckTokenMock).not.toHaveBeenCalled();
    });

    it('returns "unavailable" when verification fails with "unavailable"', async () => {
        verifyTurnstileTokenMock.mockResolvedValueOnce('unavailable');

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');
        const res = await exchangeTurnstileTokenAction('net-error-token');

        expect(res).toEqual({ status: 'unavailable' });
        expect(verifyTurnstileTokenMock).toHaveBeenCalledWith('test-secret', 'net-error-token', 'fire_app_check');
        expect(mintServerAppCheckTokenMock).not.toHaveBeenCalled();
    });

    it('returns "unavailable" when mintServerAppCheckToken returns undefined', async () => {
        verifyTurnstileTokenMock.mockResolvedValueOnce('ok');
        mintServerAppCheckTokenMock.mockResolvedValueOnce(undefined);

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');
        const res = await exchangeTurnstileTokenAction('valid-turnstile-token');

        expect(res).toEqual({ status: 'unavailable' });
        expect(mintServerAppCheckTokenMock).toHaveBeenCalledWith('test-proj', 'test-key', mockConfig.firebaseAuth!.appCheck);
    });

    it('returns "ok" with token and expireTimeMillis derived from exp in JWT payload', async () => {
        verifyTurnstileTokenMock.mockResolvedValueOnce('ok');
        // JWT header: {"alg":"none"} -> eyJhbGciOiJub25lIn0
        // JWT payload: {"exp":1700000000} -> eyJleHAiOjE3MDAwMDAwMDB9
        const dummyJwt = 'eyJhbGciOiJub25lIn0.eyJleHAiOjE3MDAwMDAwMDB9.signature';
        mintServerAppCheckTokenMock.mockResolvedValueOnce(dummyJwt);

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');
        const res = await exchangeTurnstileTokenAction('valid-turnstile-token');

        expect(res).toEqual({
            status: 'ok',
            token: dummyJwt,
            expireTimeMillis: 1700000000000,
        });
    });

    it('returns "ok" with fallback expireTimeMillis if exp claim is absent', async () => {
        verifyTurnstileTokenMock.mockResolvedValueOnce('ok');
        const dummyJwt = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.signature';
        mintServerAppCheckTokenMock.mockResolvedValueOnce(dummyJwt);

        const { default: exchangeTurnstileTokenAction } = await import('./exchange_turnstile_token_action.js');
        const res = await exchangeTurnstileTokenAction('valid-turnstile-token');

        expect(res.status).toBe('ok');
        if (res.status === 'ok') {
            expect(res.token).toBe(dummyJwt);
            expect(typeof res.expireTimeMillis).toBe('number');
        }
    });
});

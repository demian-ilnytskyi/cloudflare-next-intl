// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fa: Record<string, unknown> = {};
vi.mock('@intl-config', () => ({ default: { firebaseAuth: fa } }));

const reportError = vi.fn(async () => {});
vi.mock('../../error_handling/report_error', () => ({
    default: (...args: unknown[]) => reportError(...args),
}));

const sign = vi.fn(async () => 'custom-jwt');
const setProtectedHeader = vi.fn(() => ({ setIssuer }));
const setIssuer = vi.fn(() => ({ setSubject }));
const setSubject = vi.fn(() => ({ setAudience }));
const setAudience = vi.fn(() => ({ setIssuedAt }));
const setIssuedAt = vi.fn(() => ({ setExpirationTime }));
const setExpirationTime = vi.fn(() => ({ sign }));
const SignJWTConstructor = vi.fn(() => ({ setProtectedHeader }));
const importPKCS8 = vi.fn(async () => 'imported-key');

vi.mock('jose', () => ({
    SignJWT: class {
        constructor(...args: unknown[]) {
            return SignJWTConstructor(...args);
        }
    },
    importPKCS8: (...args: unknown[]) => importPKCS8(...args),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('mintServerAppCheckToken', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns undefined when clientEmail/privateKey/appId are not fully configured', async () => {
        const { default: mintServerAppCheckToken } = await import('./mint_server_app_check_token');
        expect(await mintServerAppCheckToken('proj', 'key', undefined)).toBeUndefined();
        expect(await mintServerAppCheckToken('proj', 'key', {})).toBeUndefined();
        expect(await mintServerAppCheckToken('proj', 'key', { clientEmail: 'a@b.com' })).toBeUndefined();
        expect(await mintServerAppCheckToken('proj', 'key', { clientEmail: 'a@b.com', privateKey: 'pk' })).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('signs a custom JWT and exchanges it for an App Check token', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: 'ac-token' }) });
        const { default: mintServerAppCheckToken } = await import('./mint_server_app_check_token');
        const result = await mintServerAppCheckToken('proj', 'key', {
            clientEmail: 'sa@proj.iam.gserviceaccount.com',
            privateKey: 'line1\\nline2',
            appId: '1:1:web:1',
        });
        expect(importPKCS8).toHaveBeenCalledWith('line1\nline2', 'RS256');
        expect(SignJWTConstructor).toHaveBeenCalledWith({ app_id: '1:1:web:1' });
        expect(setIssuer).toHaveBeenCalledWith('sa@proj.iam.gserviceaccount.com');
        expect(setSubject).toHaveBeenCalledWith('sa@proj.iam.gserviceaccount.com');
        expect(setAudience).toHaveBeenCalledWith('https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService');
        expect(setExpirationTime).toHaveBeenCalledWith('5m');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://firebaseappcheck.googleapis.com/v1/projects/proj/apps/1:1:web:1:exchangeCustomToken?key=key',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ customToken: 'custom-jwt' }) }),
        );
        expect(result).toBe('ac-token');
    });

    it('returns undefined and reports when the exchange responds non-ok', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
        const { default: mintServerAppCheckToken } = await import('./mint_server_app_check_token');
        const result = await mintServerAppCheckToken('proj', 'key', {
            clientEmail: 'sa@proj.iam.gserviceaccount.com',
            privateKey: 'pk',
            appId: '1:1:web:1',
        });
        expect(result).toBeUndefined();
        expect(reportError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ classOrMethodName: 'mintServerAppCheckToken' }));
    });

    it('returns undefined and reports when signing/fetch throws', async () => {
        fetchMock.mockRejectedValue(new Error('network down'));
        const { default: mintServerAppCheckToken } = await import('./mint_server_app_check_token');
        const result = await mintServerAppCheckToken('proj', 'key', {
            clientEmail: 'sa@proj.iam.gserviceaccount.com',
            privateKey: 'pk',
            appId: '1:1:web:1',
        });
        expect(result).toBeUndefined();
        expect(reportError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ classOrMethodName: 'mintServerAppCheckToken' }));
    });
});

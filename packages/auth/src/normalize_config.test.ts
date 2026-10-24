import { describe, it, expect, vi } from 'vitest';
import { normalizeFirebaseAuthConfig } from './normalize_config.js';
import type { FirebaseAuthRoutingConfig } from './types.js';

const baseFa: FirebaseAuthRoutingConfig = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path: string) => path === '/login',
};

describe('normalizeFirebaseAuthConfig', () => {
    it('returns undefined for undefined', () => {
        expect(normalizeFirebaseAuthConfig(undefined)).toBeUndefined();
    });

    it('returns the config unchanged when all paths already start with "/"', () => {
        const input: FirebaseAuthRoutingConfig = {
            ...baseFa,
            redirectAuthPath: '/login',
            homePath: '/',
            verifyEmailPath: '/verify-email',
            resetPasswordPath: '/reset-password',
            recoverEmailPath: '/recover-email',
            actionLinkPath: '/action-link',
        };
        expect(normalizeFirebaseAuthConfig(input)).toBe(input);
    });

    it('auto-prepends a missing leading "/" on paths and warns for each', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const input: FirebaseAuthRoutingConfig = {
            ...baseFa,
            redirectAuthPath: 'login',
            homePath: '',
            verifyEmailPath: 'verify-email',
            resetPasswordPath: 'reset',
            recoverEmailPath: 'recover',
            actionLinkPath: 'action',
        };
        const result = normalizeFirebaseAuthConfig(input);
        expect(result).not.toBe(input);
        expect(result?.redirectAuthPath).toBe('/login');
        expect(result?.homePath).toBe('');
        expect(result?.verifyEmailPath).toBe('/verify-email');
        expect(result?.resetPasswordPath).toBe('/reset');
        expect(result?.recoverEmailPath).toBe('/recover');
        expect(result?.actionLinkPath).toBe('/action');
        expect(console.warn).toHaveBeenCalledTimes(5);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.redirectAuthPath ("login")'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.verifyEmailPath ("verify-email")'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.resetPasswordPath ("reset")'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.recoverEmailPath ("recover")'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.actionLinkPath ("action")'));
    });

    it('leaves optional path fields untouched when omitted', () => {
        const input: FirebaseAuthRoutingConfig = {
            ...baseFa,
            redirectAuthPath: '/login',
            homePath: '/',
        };
        expect(normalizeFirebaseAuthConfig(input)).toBe(input);
    });
});

import { describe, it, expect, vi } from 'vitest';
import { setIntlConfig } from './init_config';

const baseFa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    isAuthPath: (path: string) => path === '/login',
};

describe('setIntlConfig', () => {
    it('returns the config object unchanged (identity function) when firebaseAuth is not set', () => {
        const input = { locales: ['en', 'fr'] as const, defaultLocale: 'en' };
        expect(setIntlConfig(input)).toBe(input);
    });

    it('returns the config object unchanged when all firebaseAuth paths already start with "/"', () => {
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, redirectAuthPath: '/login', homePath: '/', verifyEmailPath: '/verify-email' },
        };
        expect(setIntlConfig(input)).toBe(input);
    });

    it('auto-prepends a missing leading "/" on redirectAuthPath, homePath, and verifyEmailPath, warning for each', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, redirectAuthPath: 'login', homePath: '', verifyEmailPath: 'verify-email' },
        };
        const result = setIntlConfig(input);
        expect(result).not.toBe(input);
        expect(result.firebaseAuth?.redirectAuthPath).toBe('/login');
        expect(result.firebaseAuth?.homePath).toBe('');
        expect(result.firebaseAuth?.verifyEmailPath).toBe('/verify-email');
        expect(console.warn).toHaveBeenCalledTimes(2);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.redirectAuthPath ("login")'));
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('firebaseAuth.verifyEmailPath ("verify-email")'));
    });

    it('leaves verifyEmailPath untouched when omitted', () => {
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, redirectAuthPath: '/login', homePath: '/' },
        };
        expect(setIntlConfig(input)).toBe(input);
    });
});

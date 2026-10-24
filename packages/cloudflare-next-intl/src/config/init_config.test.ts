import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setIntlConfig } from './init_config.js';
import { getStaleDeployPatterns } from 'cloudflare-next-intl-errors/isStaleDeployError';

const reportErrorMock = vi.fn(async () => {});
vi.mock('cloudflare-next-intl-errors/internal/reportError', () => ({
    default: (...args: unknown[]) => reportErrorMock(...args),
}));

const baseFa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    isAuthPath: (path: string) => path === '/login',
};

describe('setIntlConfig', () => {
    beforeEach(() => {
        reportErrorMock.mockClear();
    });

    it('attaches default onError and retains config when firebaseAuth is not set', () => {
        const input = { locales: ['en', 'fr'] as const, defaultLocale: 'en' };
        const result = setIntlConfig(input as never);
        expect(result.locales).toEqual(input.locales);
        expect(result.defaultLocale).toBe(input.defaultLocale);
        expect(typeof result.onError).toBe('function');
    });

    it('returns the config with normalized firebaseAuth paths when all start with "/"', () => {
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, redirectAuthPath: '/login', homePath: '/', verifyEmailPath: '/verify-email' },
        };
        const result = setIntlConfig(input as never);
        expect(result.firebaseAuth?.redirectAuthPath).toBe('/login');
    });

    it('auto-prepends a missing leading "/" on redirectAuthPath, homePath, and verifyEmailPath, warning for each', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            firebaseAuth: { ...baseFa, redirectAuthPath: 'login', homePath: '', verifyEmailPath: 'verify-email' },
        };
        const result = setIntlConfig(input as never);
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
        const result = setIntlConfig(input as never);
        expect(result.firebaseAuth?.redirectAuthPath).toBe('/login');
    });

    it('configures staleDeployPatterns when provided under errorHandling', () => {
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            errorHandling: {
                staleDeployPatterns: ['custom-pattern-a', 'custom-pattern-b'],
            },
        };
        const result = setIntlConfig(input as never);
        expect(result.errorHandling?.staleDeployPatterns).toEqual(['custom-pattern-a', 'custom-pattern-b']);
        expect(getStaleDeployPatterns()).toEqual(['custom-pattern-a', 'custom-pattern-b']);
    });

    it('umbrella setIntlConfig routes intl onError to reportError', () => {
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            errorHandling: { email: 'ops@example.com' },
        };
        const result = setIntlConfig(input as never);
        const err = new Error('boom');
        result.onError!(err, 'testMethod');

        expect(reportErrorMock).toHaveBeenCalledWith(
            { errorHandling: input.errorHandling, generate: undefined },
            { error: err, classOrMethodName: 'testMethod' },
        );
    });

    it('user-supplied onError is kept', () => {
        const customOnError = vi.fn();
        const input = {
            locales: ['en'] as const,
            defaultLocale: 'en',
            onError: customOnError,
        };
        const result = setIntlConfig(input as never);
        expect(result.onError).toBe(customOnError);

        const err = new Error('user boom');
        result.onError!(err, 'userSource');
        expect(customOnError).toHaveBeenCalledWith(err, 'userSource');
        expect(reportErrorMock).not.toHaveBeenCalled();
    });
});

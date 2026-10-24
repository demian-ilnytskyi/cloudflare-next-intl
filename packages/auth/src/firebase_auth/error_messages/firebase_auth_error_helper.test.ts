import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('cloudflare-next-intl-intl/internal/generalFunctions', () => ({
    getTranslationsImpl: vi.fn(),
}));
vi.mock('cloudflare-next-intl-intl/internal/cacheVariables', () => ({
    getMessageCache: vi.fn(),
    getTranslationCache: vi.fn(),
    setTranslationCache: vi.fn(),
    setMessageForLocaleCache: vi.fn(),
}));

describe('firebaseAuthErrorMessage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('falls back to the English default when no message cache exists for the locale', async () => {
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', { code: 'auth/invalid-email' });
        expect(result).toBe('Please enter a valid email address.');
    });

    it('maps an unrecognized error code to the unknown key', async () => {
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', { code: 'auth/something-else' });
        expect(result).toBe('Something went wrong. Please try again.');
    });

    it('treats a non-object error as having no code', async () => {
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', 'plain string error');
        expect(result).toBe('Something went wrong. Please try again.');
    });

    it('uses the locale translation when the message cache has a matching key', async () => {
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        const { getTranslationsImpl } = await import('cloudflare-next-intl-intl/internal/generalFunctions');
        vi.mocked(getMessageCache).mockReturnValue({ firebaseAuth: { invalidEmail: 'E-mail invalide.' } } as never);
        vi.mocked(getTranslationsImpl).mockReturnValue((() => 'E-mail invalide.') as never);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('fr', { code: 'auth/invalid-email' });
        expect(result).toBe('E-mail invalide.');
    });

    it('falls back to English when the translator returns the key itself unchanged', async () => {
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        const { getTranslationsImpl } = await import('cloudflare-next-intl-intl/internal/generalFunctions');
        vi.mocked(getMessageCache).mockReturnValue({ firebaseAuth: {} } as never);
        vi.mocked(getTranslationsImpl).mockReturnValue(((key: string) => key) as never);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('fr', { code: 'auth/invalid-email' });
        expect(result).toBe('Please enter a valid email address.');
    });

    it('falls back to English when getTranslationsImpl throws', async () => {
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        const { getTranslationsImpl } = await import('cloudflare-next-intl-intl/internal/generalFunctions');
        vi.mocked(getMessageCache).mockReturnValue({ firebaseAuth: {} } as never);
        vi.mocked(getTranslationsImpl).mockImplementation(() => {
            throw new Error('boom');
        });
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('fr', { code: 'auth/invalid-email' });
        expect(result).toBe('Please enter a valid email address.');
    });

    it('falls back to the unknown message if the resolved key is somehow missing from DEFAULT_MESSAGES_EN', async () => {
        vi.resetModules();
        vi.doMock('./default_messages.en', () => ({
            DEFAULT_MESSAGES_EN: { unknown: 'Something went wrong. Please try again.' },
        }));
        const { getMessageCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', { code: 'auth/invalid-email' });
        expect(result).toBe('Something went wrong. Please try again.');

        vi.doUnmock('./default_messages.en');
        vi.resetModules();
    });

    it('uses messages seeded via core setMessageForLocaleCache', async () => {
        const actualCache = await vi.importActual<typeof import('cloudflare-next-intl-intl/internal/cacheVariables')>(
            'cloudflare-next-intl-intl/internal/cacheVariables',
        );
        const actualGeneral = await vi.importActual<typeof import('cloudflare-next-intl-intl/internal/generalFunctions')>(
            'cloudflare-next-intl-intl/internal/generalFunctions',
        );
        const { getMessageCache, getTranslationCache } = await import('cloudflare-next-intl-intl/internal/cacheVariables');
        const { getTranslationsImpl } = await import('cloudflare-next-intl-intl/internal/generalFunctions');

        actualCache.setMessageForLocaleCache('uk', {
            firebaseAuth: {
                invalidCredential: 'Невірний пароль',
            },
        } as never);

        vi.mocked(getMessageCache).mockImplementation(actualCache.getMessageCache);
        vi.mocked(getTranslationCache).mockImplementation(actualCache.getTranslationCache);
        vi.mocked(getTranslationsImpl).mockImplementation(actualGeneral.getTranslationsImpl);

        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');
        const result = firebaseAuthErrorMessage('uk', { code: 'auth/wrong-password' });
        expect(result).toBe('Невірний пароль');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../general/general_functions', () => ({
    getTranslationsImpl: vi.fn(),
}));
vi.mock('../../general/cache_variables', () => ({
    getMessageCache: vi.fn(),
    getTranslationCache: vi.fn(),
}));

describe('firebaseAuthErrorMessage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('falls back to the English default when no message cache exists for the locale', async () => {
        const { getMessageCache } = await import('../../general/cache_variables.js');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', { code: 'auth/invalid-email' });
        expect(result).toBe('Please enter a valid email address.');
    });

    it('maps an unrecognized error code to the unknown key', async () => {
        const { getMessageCache } = await import('../../general/cache_variables.js');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', { code: 'auth/something-else' });
        expect(result).toBe('Something went wrong. Please try again.');
    });

    it('treats a non-object error as having no code', async () => {
        const { getMessageCache } = await import('../../general/cache_variables.js');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', 'plain string error');
        expect(result).toBe('Something went wrong. Please try again.');
    });

    it('uses the locale translation when the message cache has a matching key', async () => {
        const { getMessageCache } = await import('../../general/cache_variables.js');
        const { getTranslationsImpl } = await import('../../general/general_functions.js');
        vi.mocked(getMessageCache).mockReturnValue({ firebaseAuth: { invalidEmail: 'E-mail invalide.' } });
        vi.mocked(getTranslationsImpl).mockReturnValue((() => 'E-mail invalide.') as never);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('fr', { code: 'auth/invalid-email' });
        expect(result).toBe('E-mail invalide.');
    });

    it('falls back to English when the translator returns the key itself unchanged', async () => {
        const { getMessageCache } = await import('../../general/cache_variables.js');
        const { getTranslationsImpl } = await import('../../general/general_functions.js');
        vi.mocked(getMessageCache).mockReturnValue({ firebaseAuth: {} });
        vi.mocked(getTranslationsImpl).mockReturnValue(((key: string) => key) as never);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('fr', { code: 'auth/invalid-email' });
        expect(result).toBe('Please enter a valid email address.');
    });

    it('falls back to English when getTranslationsImpl throws', async () => {
        const { getMessageCache } = await import('../../general/cache_variables.js');
        const { getTranslationsImpl } = await import('../../general/general_functions.js');
        vi.mocked(getMessageCache).mockReturnValue({ firebaseAuth: {} });
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
        const { getMessageCache } = await import('../../general/cache_variables.js');
        vi.mocked(getMessageCache).mockReturnValue(undefined);
        const { default: firebaseAuthErrorMessage } = await import('./firebase_auth_error_helper.js');

        const result = firebaseAuthErrorMessage('en', { code: 'auth/invalid-email' });
        expect(result).toBe('Something went wrong. Please try again.');

        vi.doUnmock('./default_messages.en');
        vi.resetModules();
    });
});

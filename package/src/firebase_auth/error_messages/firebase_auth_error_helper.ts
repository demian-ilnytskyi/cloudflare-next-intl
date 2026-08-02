import { getTranslationsImpl } from '../../general/general_functions';
import { getMessageCache } from '../../general/cache_variables';
import { DEFAULT_MESSAGES_EN } from './default_messages.en';

const ERROR_CODE_TO_KEY: Record<string, string> = {
    'auth/invalid-email': 'invalidEmail',
    'auth/user-disabled': 'userDisabled',
    'auth/user-not-found': 'invalidCredential',
    'auth/wrong-password': 'invalidCredential',
    'auth/invalid-credential': 'invalidCredential',
    'auth/email-already-in-use': 'emailAlreadyInUse',
    'auth/weak-password': 'weakPassword',
    'auth/too-many-requests': 'tooManyRequests',
    'auth/network-request-failed': 'networkRequestFailed',
    'auth/requires-recent-login': 'requiresRecentLogin',
    'auth/expired-action-code': 'expiredActionCode',
    'auth/invalid-action-code': 'invalidActionCode',
    'auth/user-token-expired': 'userTokenExpired',
};

/**
 * Resolves a Firebase auth error to a user-facing message. If the consumer's
 * locale messages have a `firebaseAuth` namespace with a matching key, that
 * translation is used; otherwise falls back to the bundled English default.
 */
export default function firebaseAuthErrorMessage(locale: string, error: unknown): string {
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    const key = ERROR_CODE_TO_KEY[code] ?? 'unknown';

    const messages = getMessageCache(locale);
    if (messages) {
        try {
            const t = getTranslationsImpl(locale, messages, 'firebaseAuth');
            const translated = t(key);
            if (typeof translated === 'string' && translated !== key) return translated;
        } catch {
            // fall through to English default
        }
    }

    // Unreachable: key is always either a value from ERROR_CODE_TO_KEY (all
    // valid DEFAULT_MESSAGES_EN keys) or the literal 'unknown' fallback
    // above, so DEFAULT_MESSAGES_EN[key] never misses.
    return DEFAULT_MESSAGES_EN[key] ?? DEFAULT_MESSAGES_EN.unknown;
}

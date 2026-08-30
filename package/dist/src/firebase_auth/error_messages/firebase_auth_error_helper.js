import { getTranslationsImpl } from '../../general/general_functions.js';
import { getMessageCache, getTranslationCache } from '../../general/cache_variables.js';
import { DEFAULT_MESSAGES_EN } from './default_messages.en.js';
const ERROR_CODE_TO_KEY = {
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
export default function firebaseAuthErrorMessage(locale, error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    const key = ERROR_CODE_TO_KEY[code] ?? 'unknown';
    const messages = getMessageCache(locale);
    if (messages) {
        try {
            const cacheKey = `${locale}-firebaseAuth`;
            const t = getTranslationCache(cacheKey) ?? getTranslationsImpl(locale, messages, 'firebaseAuth', cacheKey);
            const translated = t(key);
            if (typeof translated === 'string' && translated !== key)
                return translated;
        }
        catch {
        }
    }
    return DEFAULT_MESSAGES_EN[key] ?? DEFAULT_MESSAGES_EN.unknown;
}

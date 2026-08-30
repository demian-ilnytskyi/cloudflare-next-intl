import { bench, describe } from 'vitest';
import firebaseAuthErrorMessage from './firebase_auth_error_helper.js';
import { setMessageForLocaleCache } from '../../general/cache_variables.js';

describe('firebaseAuthErrorMessage', () => {
    bench('no message cache for locale: falls back to English default', () => {
        firebaseAuthErrorMessage('de', { code: 'auth/invalid-email' });
    });

    bench('unrecognized error code: maps to unknown key', () => {
        firebaseAuthErrorMessage('en', { code: 'auth/something-else' });
    });

    setMessageForLocaleCache('fr', { firebaseAuth: { invalidEmail: 'E-mail invalide.' } });

    bench('locale translation present: uses the cached message', () => {
        firebaseAuthErrorMessage('fr', { code: 'auth/invalid-email' });
    });
});

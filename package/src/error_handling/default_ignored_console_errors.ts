/**
 * Firebase Auth error codes this package's own `createLoginAction`/
 * `createSignUpAction`/`createForgotPasswordAction` already catch and
 * translate into a localized message (see
 * `firebase_auth/error_messages/firebase_auth_error_helper.ts`) — expected
 * user-input failures (wrong password, email already in use, etc.), not
 * bugs. They never reach `console.error`/`reportError` through this
 * package's own code; this list exists as defense-in-depth for consumers
 * whose own code logs one of these codes directly. Passing your own
 * `ignoreConsoleError` array replaces this default entirely — pass `[]` to
 * report everything.
 */
export const defaultIgnoredConsoleErrors: readonly string[] = [
    'auth/invalid-email',
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/wrong-password',
    'auth/invalid-credential',
    'auth/email-already-in-use',
    'auth/weak-password',
    'auth/too-many-requests',
    'auth/network-request-failed',
    'auth/requires-recent-login',
    'auth/expired-action-code',
    'auth/invalid-action-code',
    'auth/user-token-expired',
];

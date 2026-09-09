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
    // Logged by `initializeServerApp` itself (not thrown) when a session
    // cookie's token is revoked/stale — `getAuthenticatedAppForUser` already
    // handles it by refreshing and retrying, so it's noise, not a bug.
    'auth/invalid-user-token',
    'FirebaseServerApp could not login user with provided authIdToken',
    'The `punycode` module is deprecated. Please use a userland alternative instead.',
    'failed to pipe response',
    "FirebaseServerApp authIdToken is invalid: the token has expired.",
    "FirebaseServerApp appCheckToken is invalid: the token has expired.",
    "failed Error: Database is closing/hidden",
    'Failed to fetch RSC payload',
    'The above error occurred in a React component',
    'The connection to the page was unexpectedly closed',
    ...(process.env.NODE_ENV === 'development'
        ? ['A DurableObjectNamespace in the config referenced the class "DOQueueHandler", but no such Durable Object class is exported from the worker. Please make sure the class name matches,']
        : []),
];

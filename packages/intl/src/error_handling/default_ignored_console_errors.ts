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
    // Four wordings for the SAME thing, confirmed via a live reproduction and
    // a direct read of the errors board + vinext's own source, not a guess:
    // a navigation cancels an in-flight request, and whatever was waiting on
    // it logs the cancellation as if it were a real failure instead of
    // recognizing the race. None of these ever reach an error boundary —
    // each is already caught and only logged at its own call site — so
    // ignoring the console report is the whole fix; nothing renders because
    // of them either way. (The one wording that DOES reach a boundary,
    // Firefox's `Error in input stream`, is also matched here to stop the
    // report, and separately matched inside `is_stale_deploy_error.ts` and
    // `use_stale_deploy_recovery.ts` to stop the boundary's fallback UI from
    // painting — see those modules' docs.)
    'Error in input stream',
    // Firefox's wording for the same abort reaching a plain `fetch()` in
    // application code (e.g. a background account/permission check running
    // alongside a navigation).
    'NetworkError when attempting to fetch resource',
    // `AuthUserProvider`'s own session-cookie sync (this package,
    // `firebase_auth/client/auth_user_provider.tsx`): a cancelled
    // `writeSession`/`clearSession` server action rejects with `null`,
    // logged as `console.error('AuthUserProvider: session sync failed', null)`.
    'AuthUserProvider: session sync failed',
    // vinext's own catch-alls for a hover-triggered Link prefetch, or a
    // navigation's prefetch, that never finished — same `null`-rejection
    // shape as the one above (`node_modules/vinext/dist/shims/navigation.js`).
    '[vinext] RSC prefetch setup error:',
    '[vinext] RSC navigation error:',
    ...(process.env.NODE_ENV === 'development'
        ? ['A DurableObjectNamespace in the config referenced the class "DOQueueHandler", but no such Durable Object class is exported from the worker. Please make sure the class name matches,']
        : []),
];

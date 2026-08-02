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
export declare const defaultIgnoredConsoleErrors: readonly string[];

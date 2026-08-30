import type { AuthActionCodeSettings, AuthActionMessages, AuthFormState } from '../types.js';
/**
 * Builds a login server action for React's `useActionState` form hook.
 * The returned function has the `(prevState, formData) => Promise<AuthFormState>`
 * shape `useActionState` expects — pass it directly as the action.
 *
 * `formData` must contain `email` and `password` fields.
 *
 * @param locale Used to localize the returned error message.
 * @param messages Localized action messages (currently unused by this action).
 * @returns A form action: `{ success: true }` on success, `{ error }` on failure.
 * @example
 * const [state, action] = useActionState(createLoginAction(locale, messages), {});
 * <form action={action}>...</form>
 */
export declare function createLoginAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
/**
 * Builds a sign-up server action for React's `useActionState` form hook.
 * Same shape as {@link createLoginAction}.
 *
 * `formData` must contain `email`, `password`, and `confirmPassword` fields.
 *
 * @param locale Used to localize the returned error message.
 * @param messages `messages.mismatch` is returned as the error if
 *   `password` !== `confirmPassword`; other fields on `AuthActionMessages`
 *   are not read by this action.
 * @returns A form action: `{ success: true }` on success, `{ error }` on failure.
 * @example
 * const [state, action] = useActionState(createSignUpAction(locale, messages), {});
 * <form action={action}>...</form>
 */
export declare function createSignUpAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
/**
 * Builds a forgot-password server action for React's `useActionState` form
 * hook. Same shape as {@link createLoginAction}.
 *
 * `formData` must contain an `email` field.
 *
 * @param locale Used to localize the returned error message.
 * @param actionCodeSettings Optional settings for action email (continue URL, etc.).
 * @returns A form action: `{ success: true }` on success, `{ error }` on failure.
 * @example
 * const [state, action] = useActionState(createForgotPasswordAction(locale), {});
 * <form action={action}>...</form>
 */
export declare function createForgotPasswordAction(locale: string, actionCodeSettings?: AuthActionCodeSettings): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
/**
 * Builds a "send sign-in link" server action for React's `useActionState`
 * form hook, for passwordless email-link sign-in. Same shape as
 * {@link createLoginAction}.
 *
 * `formData` must contain an `email` field.
 *
 * @param locale Used to localize the returned error message.
 * @param actionCodeSettings Required. `actionCodeSettings.url` is the page
 *   the emailed link points to (must handle completion via a future
 *   `completeSignInWithLink` action); `handleCodeInApp` should be `true`.
 * @returns A form action: `{ success: true, email }` on success (the
 *   trimmed email, for the caller to persist as `emailForSignIn` before
 *   the user leaves this device/tab), `{ error }` on failure.
 * @example
 * const [state, action] = useActionState(
 *     createSendSignInLinkAction(locale, { url: completeUrl, handleCodeInApp: true }),
 *     {},
 * );
 * <form action={action}>...</form>
 */
export declare function createSendSignInLinkAction(locale: string, actionCodeSettings: AuthActionCodeSettings): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
/**
 * Completes a passwordless email-link sign-in. Called directly (not via
 * `useActionState`) from an effect on the link-landing page, once the URL
 * and the user's email (recovered from `localStorage`, or re-entered if
 * the link was opened on a different device) are both known.
 *
 * @param locale Used to localize the returned error message.
 * @param url The full URL the user landed on (`window.location.href`).
 * @param email The email address to complete sign-in for.
 * @returns `{ success: true }` on success, `{ error }` if the URL isn't a
 *   valid sign-in link or sign-in otherwise fails.
 * @example
 * const result = await completeSignInWithLink(locale, window.location.href, email);
 */
export declare function completeSignInWithLink(locale: string, url: string, email: string): Promise<AuthFormState>;

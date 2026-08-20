import type { AuthActionCodeSettings, AuthActionMessages, AuthFormState } from '../types';
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

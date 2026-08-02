'use client';

import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client';
import firebaseAuthErrorMessage from '../error_messages/firebase_auth_error_helper';
import type { AuthActionMessages, AuthFormState } from '../types';

function readCredentials(formData: FormData) {
    return {
        email: (formData.get('email')?.toString() ?? '').trim(),
        password: (formData.get('password')?.toString() ?? '').trim(),
    };
}

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
export function createLoginAction(locale: string, messages: AuthActionMessages) {
    return async function loginAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { signInWithEmailAndPassword } = await getFirebaseAuthModule();

        const { email, password } = readCredentials(formData);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

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
export function createSignUpAction(locale: string, messages: AuthActionMessages) {
    return async function signUpAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { createUserWithEmailAndPassword } = await getFirebaseAuthModule();

        const { email, password } = readCredentials(formData);
        const confirmPassword = (formData.get('confirmPassword')?.toString() ?? '').trim();
        if (messages.mismatch && password !== confirmPassword) {
            return { error: messages.mismatch };
        }

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

/**
 * Builds a forgot-password server action for React's `useActionState` form
 * hook. Same shape as {@link createLoginAction}.
 *
 * `formData` must contain an `email` field.
 *
 * @param locale Used to localize the returned error message.
 * @param messages Localized action messages (currently unused by this action).
 * @returns A form action: `{ success: true }` on success, `{ error }` on failure.
 * @example
 * const [state, action] = useActionState(createForgotPasswordAction(locale, messages), {});
 * <form action={action}>...</form>
 */
export function createForgotPasswordAction(locale: string, messages: AuthActionMessages) {
    return async function forgotPasswordAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { sendPasswordResetEmail } = await getFirebaseAuthModule();

        const email = (formData.get('email')?.toString() ?? '').trim();

        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

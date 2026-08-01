'use client';

import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config';
import { getFirebaseAuthClient } from './firebase_client';
import firebaseAuthErrorMessage from '../error_messages/firebase_auth_error_helper';
import type { AuthActionMessages, AuthFormState } from '../types';

function readCredentials(formData: FormData) {
    return {
        email: (formData.get('email')?.toString() ?? '').trim(),
        password: (formData.get('password')?.toString() ?? '').trim(),
    };
}

export function createLoginAction(locale: string, messages: AuthActionMessages) {
    return async function loginAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { signInWithEmailAndPassword } = await import('firebase/auth');

        const { email, password } = readCredentials(formData);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

export function createSignUpAction(locale: string, messages: AuthActionMessages) {
    return async function signUpAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { createUserWithEmailAndPassword } = await import('firebase/auth');

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

export function createForgotPasswordAction(locale: string, messages: AuthActionMessages) {
    return async function forgotPasswordAction(
        _prevState: AuthFormState,
        formData: FormData,
    ): Promise<AuthFormState> {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { sendPasswordResetEmail } = await import('firebase/auth');

        const email = (formData.get('email')?.toString() ?? '').trim();

        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}

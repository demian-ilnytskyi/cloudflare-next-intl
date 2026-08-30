'use client';
import config from '@intl-config';
import requireFirebaseAuthConfig from '../require_config.js';
import { getFirebaseAuthClient, getFirebaseAuthModule } from './firebase_client.js';
import firebaseAuthErrorMessage from '../error_messages/firebase_auth_error_helper.js';
function readCredentials(formData) {
    return {
        email: (formData.get('email')?.toString() ?? '').trim(),
        password: (formData.get('password')?.toString() ?? '').trim(),
    };
}
export function createLoginAction(locale, _messages) {
    return async function loginAction(_prevState, formData) {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { signInWithEmailAndPassword } = await getFirebaseAuthModule();
        const { email, password } = readCredentials(formData);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        }
        catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}
export function createSignUpAction(locale, messages) {
    return async function signUpAction(_prevState, formData) {
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
        }
        catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}
export function createForgotPasswordAction(locale, actionCodeSettings) {
    return async function forgotPasswordAction(_prevState, formData) {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { sendPasswordResetEmail } = await getFirebaseAuthModule();
        const email = (formData.get('email')?.toString() ?? '').trim();
        try {
            await sendPasswordResetEmail(auth, email, actionCodeSettings);
            return { success: true };
        }
        catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}
export function createSendSignInLinkAction(locale, actionCodeSettings) {
    return async function sendSignInLinkAction(_prevState, formData) {
        requireFirebaseAuthConfig(config.firebaseAuth);
        const { auth } = await getFirebaseAuthClient();
        const { sendSignInLinkToEmail } = await getFirebaseAuthModule();
        const email = (formData.get('email')?.toString() ?? '').trim();
        const url = new URL(actionCodeSettings.url);
        url.searchParams.set('email', email);
        const settingsWithEmail = { ...actionCodeSettings, url: url.toString() };
        try {
            await sendSignInLinkToEmail(auth, email, settingsWithEmail);
            return { success: true, email };
        }
        catch (e) {
            return { error: firebaseAuthErrorMessage(locale, e) };
        }
    };
}
export async function completeSignInWithLink(locale, url, email) {
    requireFirebaseAuthConfig(config.firebaseAuth);
    const { auth } = await getFirebaseAuthClient();
    const { isSignInWithEmailLink, signInWithEmailLink } = await getFirebaseAuthModule();
    if (!isSignInWithEmailLink(auth, url)) {
        return { error: firebaseAuthErrorMessage(locale, { code: 'auth/invalid-action-code' }) };
    }
    try {
        await signInWithEmailLink(auth, email, url);
        return { success: true };
    }
    catch (e) {
        return { error: firebaseAuthErrorMessage(locale, e) };
    }
}

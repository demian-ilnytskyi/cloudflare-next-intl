import type { AuthActionCodeSettings, AuthActionMessages, AuthFormState } from '../types.js';
export declare function createLoginAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
export declare function createSignUpAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
export declare function createForgotPasswordAction(locale: string, actionCodeSettings?: AuthActionCodeSettings): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
export declare function createSendSignInLinkAction(locale: string, actionCodeSettings: AuthActionCodeSettings): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
export declare function completeSignInWithLink(locale: string, url: string, email: string): Promise<AuthFormState>;

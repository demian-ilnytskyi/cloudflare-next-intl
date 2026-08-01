import type { AuthActionMessages, AuthFormState } from '../types';
export declare function createLoginAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
export declare function createSignUpAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;
export declare function createForgotPasswordAction(locale: string, messages: AuthActionMessages): (_prevState: AuthFormState, formData: FormData) => Promise<AuthFormState>;

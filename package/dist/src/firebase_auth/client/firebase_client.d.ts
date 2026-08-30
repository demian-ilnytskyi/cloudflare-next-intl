import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { FirebasePerformance } from 'firebase/performance';
interface Grecaptcha {
    ready: (callback: () => void) => void;
    render: (container: HTMLElement, params: {
        sitekey: string;
        size: 'invisible';
        callback: () => void;
        'error-callback': () => void;
    }) => string;
    execute: (widgetId: string, options: {
        action: string;
    }) => Promise<string>;
}
declare global {
    interface Window {
        grecaptcha?: Grecaptcha;
    }
}
export declare function getAppCheckToken(): Promise<string | undefined>;
export declare function getFirebaseAuthClient(): Promise<{
    app: FirebaseApp;
    auth: Auth;
}>;
export declare function getFirebaseAuthClientSync(): {
    app: FirebaseApp;
    auth: Auth;
} | undefined;
export declare function getFirebasePerformanceSync(): FirebasePerformance | undefined;
export declare function getFirebaseAuthModule(): Promise<typeof import('firebase/auth')>;
export {};

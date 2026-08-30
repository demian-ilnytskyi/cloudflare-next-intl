import type { User } from 'firebase/auth';
export interface SerializedAuthUser {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
}
export type AuthFormState = {
    error?: string;
    success?: boolean;
    email?: string;
};
export interface AuthActionMessages {
    success?: string;
    mismatch?: string;
}
export type AuthUser = User | SerializedAuthUser;
export interface AuthActionCodeSettings {
    url: string;
    handleCodeInApp?: boolean;
    iOS?: {
        bundleId: string;
    };
    android?: {
        packageName: string;
        installApp?: boolean;
        minimumVersion?: string;
    };
    dynamicLinkDomain?: string;
    linkDomain?: string;
}

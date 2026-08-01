import type { User } from 'firebase/auth';

/**
 * Plain, RSC-serializable projection of `firebase/auth`'s `User` — enough
 * for first paint on the server; superseded by the real `User` once the
 * client's `onIdTokenChanged` listener fires.
 */
export interface SerializedAuthUser {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
}

export type AuthFormState = { error?: string; success?: boolean };

/** Overrides for the default English auth error/status messages. */
export interface AuthActionMessages {
    success?: string;
    mismatch?: string;
}

export type AuthUser = User | SerializedAuthUser;

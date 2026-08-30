import type { AuthActionCodeSettings, AuthUser, SerializedAuthUser } from '../types.js';
export interface AuthUserContextType {
    user: AuthUser | null;
    loading: boolean;
    reloadUser: () => Promise<void>;
    sendVerificationEmail: (actionCodeSettings?: AuthActionCodeSettings) => Promise<void>;
    logout: () => Promise<void>;
}
export declare const AuthUserContext: import("react").Context<AuthUserContextType | null>;
export default function AuthUserProvider({ initialUser, children }: {
    initialUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): React.JSX.Element;

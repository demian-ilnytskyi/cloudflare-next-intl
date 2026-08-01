import type { AuthUser, SerializedAuthUser } from '../types';
export interface AuthUserContextType {
    user: AuthUser | null;
    loading: boolean;
    reloadUser: () => Promise<void>;
    sendVerificationEmail: () => Promise<void>;
    logout: () => Promise<void>;
}
export declare const AuthUserContext: import("react").Context<AuthUserContextType>;
export default function AuthUserProvider({ initialUser, children }: {
    initialUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): import("react").JSX.Element;

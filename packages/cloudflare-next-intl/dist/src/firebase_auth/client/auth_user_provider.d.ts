import type { SerializedAuthUser } from '../types.js';
import { AuthUserContext, type AuthUserContextType } from './auth_user_context.js';
export { AuthUserContext };
export type { AuthUserContextType };
export default function AuthUserProvider({ initialUser, children }: {
    initialUser?: SerializedAuthUser | null;
    children: React.ReactNode;
}): React.JSX.Element;

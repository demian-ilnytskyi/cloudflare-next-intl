import type { SerializedAuthUser } from '../types.js';
export default function AuthUserPendingProvider({ initialUser, children }: {
    initialUser?: SerializedAuthUser | null;
    children?: React.ReactNode;
}): React.JSX.Element;

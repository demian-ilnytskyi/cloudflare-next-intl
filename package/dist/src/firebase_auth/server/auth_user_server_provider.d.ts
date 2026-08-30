import type { SerializedAuthUser } from '../types.js';
export declare function resolveAuthUserAndRedirect(): Promise<SerializedAuthUser | null>;
export default function AuthUserServerProvider({ children }: {
    children: React.ReactNode;
}): Promise<import("react").JSX.Element>;

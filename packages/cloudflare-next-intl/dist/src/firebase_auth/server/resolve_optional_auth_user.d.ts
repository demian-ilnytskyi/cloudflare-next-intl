import type { User } from '@firebase/auth';
export default function resolveOptionalAuthUser(): Promise<{
    user: User | null;
}>;
export declare function resolveErrorReportingUser(useAuthUser?: boolean): Promise<{
    user: User | null;
}>;

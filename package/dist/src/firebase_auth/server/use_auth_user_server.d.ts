import type { User } from 'firebase/auth';
declare function iGetAuthUser(): Promise<{
    user: User | null;
    loading: false;
}>;
export declare const getAuthUser: typeof iGetAuthUser;
export default function useAuthUser(): Promise<{
    user: User | null;
    loading: false;
}>;
export {};

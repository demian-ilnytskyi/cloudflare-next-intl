import type { FirebaseApp } from '@firebase/app';
import type { User } from '@firebase/auth';
export declare const getAuthenticatedAppForUser: () => Promise<{
    firebaseServerApp: FirebaseApp | null;
    currentUser: User | null;
}>;

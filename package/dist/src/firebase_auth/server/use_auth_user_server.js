import { getAuthenticatedAppForUser } from './firebase_server.js';
async function iGetAuthUser() {
    const { currentUser } = await getAuthenticatedAppForUser();
    return { user: currentUser, loading: false };
}
export const getAuthUser = iGetAuthUser;
export default async function useAuthUser() {
    return getAuthUser();
}

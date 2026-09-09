import { getAuthUser } from './use_auth_user_server.js';
export default async function resolveOptionalAuthUser() {
    try {
        const { user } = await getAuthUser();
        return { user };
    }
    catch {
        return { user: null };
    }
}
export async function resolveErrorReportingUser(useAuthUser) {
    if (useAuthUser !== true)
        return { user: null };
    return resolveOptionalAuthUser();
}

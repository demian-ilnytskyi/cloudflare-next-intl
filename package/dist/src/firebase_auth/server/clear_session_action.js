"use server";
import { cookies } from "next/headers";
import config from "@intl-config";
import { defaultRefreshTokenCookieName, defaultSessionCookieName } from "../middleware/update_session";
/**
 * Server action: clears the httpOnly session/refresh-token cookies.
 * `document.cookie` on the client can't touch httpOnly cookies, so
 * `AuthUserProvider`'s `logout()` calls this instead of clearing them
 * itself.
 */
export default async function clearSessionAction() {
    const fa = config.firebaseAuth;
    if (!fa)
        return;
    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const cookieStore = await cookies();
    cookieStore.delete(sessionCookieName);
    cookieStore.delete(refreshTokenCookieName);
}

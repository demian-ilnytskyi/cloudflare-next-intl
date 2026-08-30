"use server";
import { cookies } from "next/headers";
import config from "@intl-config";
import { defaultRefreshTokenCookieName, defaultSessionCookieName } from "../middleware/update_session.js";
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

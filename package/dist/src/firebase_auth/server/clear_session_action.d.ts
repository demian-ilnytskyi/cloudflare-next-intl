/**
 * Server action: clears the httpOnly session/refresh-token cookies.
 * `document.cookie` on the client can't touch httpOnly cookies, so
 * `AuthUserProvider`'s `logout()` calls this instead of clearing them
 * itself.
 */
export default function clearSessionAction(): Promise<void>;

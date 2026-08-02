/**
 * Client-only: reads a `document.cookie` value by name. Pairs with
 * {@link setCookie} for your OWN client-side cookies — this package's
 * locale/theme cookies are managed internally, you don't need this for those.
 *
 * @param name Cookie name to look up.
 * @returns The decoded cookie value, or `null` if not found (or on error,
 *   logged instead of thrown).
 */
export default function getCookie(name: string): string | null;

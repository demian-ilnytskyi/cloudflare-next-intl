/**
 * Resolves a Firebase auth error to a user-facing message. If the consumer's
 * locale messages have a `firebaseAuth` namespace with a matching key, that
 * translation is used; otherwise falls back to the bundled English default.
 */
export default function firebaseAuthErrorMessage(locale: string, error: unknown): string;

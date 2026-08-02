"use server";
import reportError from './report_error';
import stringifyUnknown from './stringify_unknown';
/**
 * Creates a `"use server"` action that reports a client-originated error via
 * `reportError`, so `config` (and anything it closes over — secrets,
 * `Secrets.telegramBotToken`-style env reads inside your `onError`) never
 * has to be imported into client-side code. Call this once (server-side,
 * e.g. next to your `RoutingConfig`) and pass the returned function to
 * client components that need to report an error — they only ever handle
 * the error value itself, never `config`.
 *
 * The error is stringified before crossing the client→server action
 * boundary (Next.js server actions serialize arguments; an `Error` instance
 * doesn't survive that intact) and `isClient: true` is set automatically.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function createServerErrorAction(config) {
    return async function reportClientError(error, classOrMethodName, params) {
        await reportError(config, {
            error: stringifyUnknown(error, true),
            classOrMethodName,
            params,
            isClient: true,
        });
    };
}

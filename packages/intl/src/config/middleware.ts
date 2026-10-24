import {
    createIntlMiddleware,
    localesSet,
    type IntlMiddlewareContext,
    type IntlMiddlewareHook,
} from './create_intl_middleware.js';

export {
    createIntlMiddleware,
    localesSet,
    type IntlMiddlewareContext,
    type IntlMiddlewareHook,
};

/**
 * This middleware function runs for every incoming request. Handles locale
 * detection/routing, then optionally defers to your own custom logic.
 *
 * @param request The incoming request (pass through from your `middleware.ts`).
 * @param options.middlewareHandler  Your own logic (auth, feature flags, etc.),
 *   run alongside locale routing — see `MiddlewareCustomHandler` for the
 *   full contract (`rewriteUrl` / `redirectUrl` and what to return).
 * @param options.runHandlerOnRedirect  By default, `middlewareHandler` does
 *   NOT run for the locale-redirect case (so it never receives a
 *   `redirectUrl`). Set to `true` to also run it on redirects.
 *   Defaults to `false`.
 */
const intlMiddleware = createIntlMiddleware();

export default intlMiddleware;


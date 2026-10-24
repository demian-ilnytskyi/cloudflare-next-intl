import {
    createIntlMiddleware,
    localesSet,
    type IntlMiddlewareContext,
    type IntlMiddlewareHook,
} from 'cloudflare-next-intl-intl/middleware';
import type { NextRequest, NextResponse } from 'next/server.js';
import type { MiddlewareCustomHandler } from 'cloudflare-next-intl-intl/types';
import config from './intl_config.js';
import type * as UpdateSessionModule from '../firebase_auth/middleware/update_session.js';

let updateSessionModule: typeof UpdateSessionModule | undefined;

export const defaultAfterResponse: IntlMiddlewareHook = async (
    response,
    ctx,
) => {
    if (config.firebaseAuth && config.firebaseAuth.middlewareEnabled !== false) {
        if (!updateSessionModule) {
            updateSessionModule = await import('../firebase_auth/middleware/update_session.js');
        }
        return updateSessionModule.default(
            ctx.request,
            response as never,
            ctx.locale,
            ctx.next,
        ) as never;
    }
    return response;
};

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
 *   run alongside locale routing — see {@link MiddlewareCustomHandler} for the
 *   full contract (`rewriteUrl` / `redirectUrl` and what to return).
 * @param options.runHandlerOnRedirect  By default, `middlewareHandler` does
 *   NOT run for the locale-redirect case (so it never receives a
 *   `redirectUrl`). Set to `true` to also run it on redirects.
 *   Defaults to `false`.
 */
export type IntlMiddleware = (
    request: NextRequest,
    options?: { middlewareHandler?: MiddlewareCustomHandler; runHandlerOnRedirect?: boolean },
) => Promise<NextResponse>;

const intlMiddleware: IntlMiddleware = createIntlMiddleware({ afterResponse: defaultAfterResponse }) as never;

export default intlMiddleware;

import {
    createIntlMiddleware,
    localesSet,
    type IntlMiddlewareContext,
    type IntlMiddlewareHook,
} from 'cloudflare-next-intl-intl/middleware';
import type { NextRequest, NextResponse } from 'next/server.js';
import config from './intl_config.js';
import type * as UpdateSessionModule from '../firebase_auth/middleware/update_session.js';

let updateSessionModule: typeof UpdateSessionModule | undefined;

export const defaultAfterResponse = async (
    response: NextResponse,
    ctx: { request: NextRequest; locale: string; next: (refreshedRequest: NextRequest) => NextResponse },
): Promise<NextResponse> => {
    if (config.firebaseAuth && config.firebaseAuth.middlewareEnabled !== false) {
        if (!updateSessionModule) {
            updateSessionModule = await import('../firebase_auth/middleware/update_session.js');
        }
        return updateSessionModule.default(
            ctx.request,
            response,
            ctx.locale,
            ctx.next,
        );
    }
    return response;
};

export {
    createIntlMiddleware,
    localesSet,
    type IntlMiddlewareContext,
    type IntlMiddlewareHook,
};

import type { MiddlewareCustomHandler } from '../types/types.js';

const middleware: (
    request: NextRequest,
    options?: { middlewareHandler?: MiddlewareCustomHandler; runHandlerOnRedirect?: boolean },
) => Promise<NextResponse> = createIntlMiddleware({ afterResponse: defaultAfterResponse as never }) as never;

export default middleware;

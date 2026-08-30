import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { MiddlewareCustomHandler } from '../types/types.js';
export declare const localesSet: Set<string>;
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
export default function intlMiddleware(request: NextRequest, options?: {
    middlewareHandler?: MiddlewareCustomHandler;
    runHandlerOnRedirect?: boolean;
}): Promise<NextResponse<unknown>>;

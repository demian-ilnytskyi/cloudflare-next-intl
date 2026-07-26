import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { MiddlewareCustomHandler } from '../types/types';
export declare const localesSet: Set<string>;
export default function intlMiddleware(request: NextRequest, options?: {
    middlewareHandler?: MiddlewareCustomHandler;
    runHandlerOnRedirect?: boolean;
}): Promise<NextResponse<unknown>>;

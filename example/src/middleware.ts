import intlMiddleware from "cloudflare-next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// This middleware function runs for every incoming request
export function middleware(request: NextRequest) {
    return intlMiddleware(request, {
        // Runs when the locale is resolved and no redirect happened (rewrite or next).
        // Return a NextResponse to override the default response, or null to fall back to it.
        middlewareHandler: (req, locale, targetUrl) => {
            // Example: custom auth check using Supabase (or any other) session cookie
            // const session = req.cookies.get("session")?.value;
            // if (!session) {
            //     return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
            // }
            return null;
        },
        // Set to true to also run middlewareHandler when a locale redirect happens (default: false)
        runHandlerOnRedirect: false,
    });
}

// Configuration for the middleware
export const config = {
    // Define the paths the middleware should apply to
    matcher: [
        {
            // Apply to all paths except API routes, Next.js static files,
            // Next.js image optimization URLs, and the favicon.ico
            source:
                "/((?!_next/static|_next/image|favicon\\.ico|icons|images|sitemap\\.xml|robots\\.txt|BUILD_ID|.*\\/manifest\\.json$).*)",
            // Also exclude requests that are typically for prefetching
            // This prevents the middleware from running unnecessarily for prefetched links
            missing: [
                { type: "header", key: "next-router-prefetch" },
                { type: "header", key: "purpose", value: "prefetch" },
            ],
        },
    ],
};

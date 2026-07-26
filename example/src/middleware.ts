import intlMiddleware from "cloudflare-next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// This middleware function runs for every incoming request
export function middleware(request: NextRequest) {
    return intlMiddleware(request, {
        // STRICT RULE: at most one of rewriteUrl / redirectUrl is ever set.
        //   rewriteUrl set   -> NextResponse.rewrite(rewriteUrl, { request })
        //   redirectUrl set  -> NextResponse.redirect(redirectUrl, request)
        //   both undefined   -> no locale routing needed. Your own logic
        //                       (auth, feature flags, ...) goes here.
        middlewareHandler: (locale, rewriteUrl, redirectUrl) => {
            if (rewriteUrl) {
                return NextResponse.rewrite(rewriteUrl, {
                    request,
                });
            }
            if (redirectUrl) {
                return NextResponse.redirect(redirectUrl, request);
            }
            // Example: send a specific locale to a maintenance page.
            if (locale === "de") {
                return NextResponse.redirect(new URL(`/${locale}/maintenance`, request.url));
            }
            return NextResponse.next({ request });
        },
        // Set to true to also run middlewareHandler when a locale redirect happens (default: false)
        runHandlerOnRedirect: true,
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

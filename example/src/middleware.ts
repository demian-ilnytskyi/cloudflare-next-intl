import intlMiddleware from "cloudflare-next-intl/middleware";
// This middleware function runs for every incoming request

export const middleware = intlMiddleware;

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

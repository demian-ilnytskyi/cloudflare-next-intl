"use client";

import LinkComponent, { type LinkProps } from 'next/link.js';
import {
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
    useTransition,
    type ComponentProps,
    type Ref,
} from 'react';
import type { UrlObject } from 'url';
import config from '../../config/intl_config.js';
import { getLocaleCache } from '../../general/cache_variables.js';
import { usePathname, useRouter } from 'next/navigation.js';

type Url = string | UrlObject;

/**
 * `prefetch` defaults to `false` — no route is ever prefetched (no
 * hover/pointerdown/mount prefetching) unless a caller explicitly opts in
 * with `prefetch` (a plain boolean, honored per `next/link`) or
 * `prefetchType="eager"` combined with `prefetch={true}`. This is a
 * deliberate default for backends with real per-request latency: many Links
 * mounted together (a sidebar, a results table) must never burst-prefetch
 * and starve the page's own real data fetch for a connection/worker slot.
 *
 * - `'custom'` (default): loop-safe click interception (`startTransition` +
 *   `router.push`, plus double-click navigation protection) — this is what
 *   avoids the prefetch-loop bug `prefetchType="default"` causes on this
 *   router setup. With `prefetch` left at its `false` default it does no
 *   prefetching at all; pass `prefetch={true}` to opt back into
 *   hover/pointerdown-dwell prefetch.
 * - `'eager'`: same click interception as `'custom'`, PLUS (only when
 *   `prefetch={true}` is also passed) prefetches ~100ms after mount even
 *   without a hover. Opt into this only for a Link that's alone (or one of a
 *   small, fixed few) on the page.
 * - `'default'`: vanilla `next/link` prefetch behavior — do not use for
 *   in-app navigation Links on this router setup, see `'custom'` above; only
 *   for links `next/link` itself should own (external-ish or special cases).
 */
export type PrefetchType = 'custom' | 'eager' | 'default';

type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> &
    Omit<LinkProps, 'locale'> & {
        prefetchType?: PrefetchType;
    };

type Props = NextLinkProps;

// Global session deduping set to prevent infinite prefetch loops across route TTL expirations
const prefetchedRoutes = new Set<string>();

/**
 * Fired on `window` the instant a `'custom'`/`'eager'` Link's click handler
 * decides to navigate — `detail` is the target path — and again with
 * `detail: null` once the router's real `pathname` catches up. The RSC
 * response on this stack isn't streamed incrementally, so a route's own
 * `loading.tsx` typically never gets a chance to paint before its real
 * content (both arrive in the same response). This event is what lets a
 * consumer show its own instant, purely client-side "you're on the new
 * page now" state — including moving the address bar itself via
 * `history.replaceState` below — without waiting on that slow response.
 */
export const PENDING_NAVIGATION_EVENT = 'cloudflare-next-intl:pending-navigation';

function CustomLinkFunction(
    {
        href,
        prefetch,
        prefetchType = 'custom',
        onClick,
        onMouseEnter,
        onMouseLeave,
        onPointerDown,
        ...rest
    }: Props,
    ref: Ref<HTMLAnchorElement>
) {
    const localeValue = getLocaleCache();
    const router = useRouter();

    // A given `Link`'s own `prefetch` prop always wins; otherwise fall back
    // to `link.defaultPrefetch` from `setIntlConfig` (see `LinkRoutingConfig`),
    // defaulting to `false` when neither is set.
    prefetch ??= config.link?.defaultPrefetch ?? false;

    const needsLangPath = localeValue !== config.defaultLocale || !localeValue;

    let pathnames: Url;
    let urlString: string;

    if (needsLangPath) {
        const pathPart = typeof href === 'object' ? (href.pathname || '') : (href || '');
        pathnames = `/${localeValue}${pathPart}`;
        urlString = pathnames;
    } else {
        pathnames = href;
        urlString = typeof href === 'object' ? (href.pathname || '') : (href || '');
    }

    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [isNavigating, setIsNavigating] = useState(false);

    useEffect(() => {
        setIsNavigating(false);
        window.dispatchEvent(new CustomEvent<string | null>(PENDING_NAVIGATION_EVENT, { detail: null }));
    }, [pathname]);

    // Safety net: `isNavigating` otherwise only clears when `pathname`
    // actually changes. A transition that never lands — an error mid-render,
    // a dev-server compile queue backed up, a request that just hangs — means
    // pathname never changes, so without this every future click on every
    // Link in the app is silently swallowed (`handleClick`'s
    // `e.preventDefault(); return;` below) with no error and no way to
    // recover short of a hard reload. 10s is generous for a real navigation;
    // it exists only to bound the failure, not to be a normal-path timer.
    useEffect(() => {
        if (!isNavigating) return;
        const timer = setTimeout(() => setIsNavigating(false), 10000);
        return () => clearTimeout(timer);
    }, [isNavigating]);

    // isCustom drives the loop-safe click interception (startTransition +
    // router.push instead of a plain <a> navigation) — this is what avoids
    // the prefetch-loop bug `prefetchType="default"` causes on this router
    // setup, and it must stay on even when prefetching itself is off.
    const isCustom = prefetchType === 'custom' || prefetchType === 'eager';
    const prefetchEnabled = isCustom && prefetch !== false;
    const isEager = prefetchType === 'eager' && prefetchEnabled;

    const doPrefetch = useCallback(() => {
        if (!urlString || urlString.startsWith('#') || prefetchedRoutes.has(urlString)) {
            return;
        }
        prefetchedRoutes.add(urlString);
        try {
            router.prefetch(typeof pathnames === 'string' ? pathnames : urlString);
        } catch {
            // ignore prefetch errors
        }
    }, [urlString, pathnames, router]);

    // pointerdown fires only when the user has already committed to this
    // link (finger/mouse down right before the click lands) — unlike hover,
    // it can't fire from a cursor merely passing over the link on its way
    // elsewhere. That makes it safe to prefetch on regardless of the
    // `prefetch` opt-in that gates hover/eager-mount prefetching.
    const triggerPointerDownPrefetch = useCallback(() => {
        if (!isCustom) return;
        doPrefetch();
    }, [isCustom, doPrefetch]);

    useEffect(() => {
        if (!isEager) return;
        const timer = setTimeout(doPrefetch, 100);
        return () => clearTimeout(timer);
    }, [urlString, isEager, doPrefetch]);

    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHoverTimer = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    // Dwell delay: only prefetch once the pointer rests on the link for
    // 100ms, instead of firing on every mouseenter. A cursor merely passing
    // over a link on its way elsewhere (scrolling a sidebar, moving toward
    // another target) would otherwise trigger a prefetch it never needed.
    const handleHoverStart = () => {
        if (!prefetchEnabled) return;
        clearHoverTimer();
        hoverTimerRef.current = setTimeout(doPrefetch, 100);
    };

    const handleHoverEnd = () => {
        clearHoverTimer();
    };

    useEffect(() => clearHoverTimer, []);

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;

        if (isCustom && (isNavigating || isPending)) {
            e.preventDefault();
            return;
        }

        if (isCustom) {
            const targetPath = typeof pathnames === 'string' ? pathnames : urlString;
            if (pathname !== targetPath) {
                setIsNavigating(true);
                // Optimistic address-bar move: `replaceState` (not
                // `pushState`) so it doesn't add a duplicate history entry —
                // the router's own `router.push` below still owns the real
                // history entry once its slow response lands.
                try {
                    window.history.replaceState(window.history.state, '', targetPath);
                    window.dispatchEvent(new CustomEvent<string | null>(PENDING_NAVIGATION_EVENT, { detail: targetPath }));
                } catch {
                    // ignore — purely a UX nicety, navigation still proceeds below
                }
            }
            startTransition(() => {
                router.push(targetPath);
            });
            e.preventDefault();
        }
    };

    const effectivePrefetch = isCustom ? false : prefetch;

    return <LinkComponent
        ref={ref}
        href={pathnames}
        prefetch={effectivePrefetch}
        onClick={handleClick}
        onMouseEnter={(e) => {
            handleHoverStart();
            onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
            handleHoverEnd();
            onMouseLeave?.(e);
        }}
        onPointerDown={(e) => {
            triggerPointerDownPrefetch();
            onPointerDown?.(e);
        }}
        {...rest}
    />;
}

/**
 * Server-safe, locale-aware drop-in replacement for `next/link`. Import
 * from `cloudflare-next-intl/Link` (a separate subpath from the client-side
 * `LocaleLink`).
 *
 * Prepends the current locale segment to `href` automatically when the
 * current locale isn't the `defaultLocale` — you never build the
 * `/en/about`-style path yourself. To link to a SPECIFIC locale (a language
 * switcher) use `LocaleLink` instead, which takes an explicit `locale` prop.
 *
 * See {@link PrefetchType} for `prefetchType`'s three modes — `'custom'`
 * (default, hover-only) covers most Links; `'eager'` is the opt-in for a
 * standalone Link worth prefetching before any interaction.
 *
 * @example
 * ```tsx
 * import Link from "cloudflare-next-intl/Link";
 *
 * <Link href="/about">About</Link> // -> "/about" or "/de/about"
 * <Link href="/about" prefetchType="eager">About</Link>
 * <Link href="/about" prefetchType="default">About</Link>
 * ```
 */
const Link = forwardRef(CustomLinkFunction);

export default Link;

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

/** Fired on `window` the instant a custom-intercepted click starts a
 * navigation (`detail` = target path) and again once it lands or a fresh
 * Link mounts on the new route (`detail` = null). Consumers like a global
 * transition-loading gate rely on this to know when to show/hide. */
export const PENDING_NAVIGATION_EVENT = 'cloudflare-next-intl:pending-navigation';

/**
 * `prefetch` defaults to `true` — a `'custom'`/`'eager'` Link prefetches on
 * hover (after a 100ms dwell, not on every `mouseenter`) and on pointerdown.
 * Pass `prefetch={false}` on a given Link to opt it out.
 *
 * - `'custom'` (default): loop-safe click interception (`startTransition` +
 *   `router.push`, plus double-click navigation protection) — this is what
 *   avoids the prefetch-loop bug `prefetchType="default"` causes on this
 *   router setup. Hover-dwell and pointerdown prefetch, per the `prefetch`
 *   prop above.
 * - `'eager'`: same click interception as `'custom'`, PLUS (unless
 *   `prefetch={false}` is passed) prefetches ~100ms after mount even without
 *   a hover. Opt into this only for a Link that's alone (or one of a small,
 *   fixed few) on the page — many of these mounting together turns one page
 *   load into a burst of navigations' worth of server work.
 * - `'default'`: vanilla `next/link` prefetch behavior — do not use for
 *   in-app navigation Links on this router setup, see `'custom'` above; only
 *   for links `next/link` itself should own (external-ish or special cases).
 */
export type PrefetchType = 'custom' | 'eager' | 'default';

type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> &
    Omit<LinkProps, 'locale'> & {
        prefetchType?: PrefetchType;
        /**
         * How long the pointer must dwell on the link before hover-prefetch
         * fires. Defaults to `100` (ms). `0` prefetches immediately on
         * `mouseenter`, with no dwell. Pointerdown prefetch is unaffected —
         * it always fires immediately, dwell or not.
         */
        hoverPrefetchDelayMs?: number;
    };

type Props = NextLinkProps;

// Global session deduping set to prevent infinite prefetch loops across route TTL expirations
const prefetchedRoutes = new Set<string>();

function CustomLinkFunction(
    {
        href,
        prefetch,
        prefetchType = 'custom',
        hoverPrefetchDelayMs = 100,
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

    // Defaults to `true`: a `'custom'`/`'eager'` Link hover-prefetches (100ms
    // dwell) and pointerdown-prefetches unless a caller explicitly opts out
    // with `prefetch={false}`.
    prefetch ??= config.link?.defaultPrefetch ?? true;

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

    // A freshly-mounted Link (e.g. a sidebar item swapping from a plain
    // <span> to this Link when it stops being the active route) must not
    // dispatch the "landed" event on its very first effect run — that would
    // clear a pending navigation someone else just started in the same
    // render pass, before it ever gets a chance to show.
    const isFirstPathnameEffect = useRef(true);
    useEffect(() => {
        setIsNavigating(false);
        if (isFirstPathnameEffect.current) {
            isFirstPathnameEffect.current = false;
            return;
        }
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
    // `hoverPrefetchDelayMs` (100ms by default), instead of firing on every
    // mouseenter. A cursor merely passing over a link on its way elsewhere
    // (scrolling a sidebar, moving toward another target) would otherwise
    // trigger a prefetch it never needed. `0` fires immediately on hover.
    const handleHoverStart = () => {
        if (!prefetchEnabled) return;
        clearHoverTimer();
        if (hoverPrefetchDelayMs <= 0) {
            doPrefetch();
            return;
        }
        hoverTimerRef.current = setTimeout(doPrefetch, hoverPrefetchDelayMs);
    };

    const handleHoverEnd = () => {
        clearHoverTimer();
    };

    useEffect(() => clearHoverTimer, []);

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        if (isCustom && (isNavigating || isPending)) {
            e.preventDefault();
            return;
        }

        if (isCustom) {
            const targetPath = typeof pathnames === 'string' ? pathnames : urlString;
            if (pathname !== targetPath) {
                setIsNavigating(true);
                window.dispatchEvent(new CustomEvent<string | null>(PENDING_NAVIGATION_EVENT, { detail: targetPath }));
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

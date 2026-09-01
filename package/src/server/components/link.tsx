"use client";

import LinkComponent, { type LinkProps } from 'next/link.js';
import {
    forwardRef,
    useCallback,
    useEffect,
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

export type PrefetchType = 'custom' | 'default';

type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> &
    Omit<LinkProps, 'locale'> & {
        prefetchType?: PrefetchType;
    };

type Props = NextLinkProps;

// Global session deduping set to prevent infinite prefetch loops across route TTL expirations
const prefetchedRoutes = new Set<string>();

function CustomLinkFunction(
    {
        href,
        prefetch,
        prefetchType = 'custom',
        onClick,
        onMouseEnter,
        onPointerDown,
        ...rest
    }: Props,
    ref: Ref<HTMLAnchorElement>
) {
    const localeValue = getLocaleCache();
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [isNavigating, setIsNavigating] = useState(false);

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

    const isCustom = prefetchType === 'custom';

    useEffect(() => {
        setIsNavigating(false);
    }, [pathname]);

    const triggerPrefetch = useCallback(() => {
        if (!isCustom || !urlString || urlString.startsWith('#') || prefetchedRoutes.has(urlString)) {
            return;
        }
        prefetchedRoutes.add(urlString);
        try {
            router.prefetch(typeof pathnames === 'string' ? pathnames : urlString);
        } catch {
            // ignore prefetch errors
        }
    }, [isCustom, urlString, pathnames, router]);

    useEffect(() => {
        if (!isCustom) return;
        const timer = setTimeout(triggerPrefetch, 500);
        return () => clearTimeout(timer);
    }, [urlString, isCustom, triggerPrefetch]);

    const handleHoverPrefetch = () => {
        if (isCustom) {
            triggerPrefetch();
        }
    };

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;

        if (isCustom && (isNavigating || isPending)) {
            e.preventDefault();
            return;
        }

        if (isCustom) {
            setIsNavigating(true);
            startTransition(() => {
                router.push(typeof pathnames === 'string' ? pathnames : urlString);
            });
            e.preventDefault();
        }
    };

    const effectivePrefetch = isCustom ? (prefetch ?? false) : prefetch;

    return <LinkComponent
        ref={ref}
        href={pathnames}
        prefetch={effectivePrefetch}
        onClick={handleClick}
        onMouseEnter={(e) => {
            handleHoverPrefetch();
            onMouseEnter?.(e);
        }}
        onPointerDown={(e) => {
            handleHoverPrefetch();
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
 * Features:
 * - `prefetchType="custom"` (default): Prevents Next.js dynamic route infinite
 *   prefetch loops, prefetches on browser idle and hover, and prevents
 *   double-click navigation aborts.
 * - `prefetchType="default"`: Falls back to vanilla `next/link` prefetch behavior.
 *
 * @example
 * ```tsx
 * import Link from "cloudflare-next-intl/Link";
 *
 * <Link href="/about">About</Link> // -> "/about" or "/de/about"
 * <Link href="/about" prefetchType="default">About</Link>
 * ```
 */
const Link = forwardRef(CustomLinkFunction);

export default Link;

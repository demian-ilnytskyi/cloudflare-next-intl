"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import LinkComponent from 'next/link.js';
import { forwardRef, useCallback, useEffect, useRef, useState, useTransition, } from 'react';
import config from '../../config/intl_config.js';
import { getLocaleCache } from '../../general/cache_variables.js';
import { usePathname, useRouter } from 'next/navigation.js';
export const PENDING_NAVIGATION_EVENT = 'cloudflare-next-intl:pending-navigation';
const prefetchedRoutes = new Set();
function CustomLinkFunction({ href, prefetch, prefetchType = 'custom', hoverPrefetchDelayMs = 100, onClick, onMouseEnter, onMouseLeave, onPointerDown, ...rest }, ref) {
    const localeValue = getLocaleCache();
    const router = useRouter();
    prefetch ?? (prefetch = config.link?.defaultPrefetch ?? true);
    const needsLangPath = localeValue !== undefined && localeValue !== config.defaultLocale;
    let pathnames;
    let urlString;
    if (needsLangPath) {
        const pathPart = typeof href === 'object' ? (href.pathname || '') : (href || '');
        pathnames = `/${localeValue}${pathPart}`;
        urlString = pathnames;
    }
    else {
        pathnames = href;
        urlString = typeof href === 'object' ? (href.pathname || '') : (href || '');
    }
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [isNavigating, setIsNavigating] = useState(false);
    const isFirstPathnameEffect = useRef(true);
    useEffect(() => {
        setIsNavigating(false);
        if (isFirstPathnameEffect.current) {
            isFirstPathnameEffect.current = false;
            return;
        }
        window.dispatchEvent(new CustomEvent(PENDING_NAVIGATION_EVENT, { detail: null }));
    }, [pathname]);
    const openedPendingEvent = useRef(false);
    const wasPending = useRef(false);
    useEffect(() => {
        if (isPending) {
            wasPending.current = true;
            return;
        }
        if (!wasPending.current)
            return;
        wasPending.current = false;
        setIsNavigating(false);
        if (!openedPendingEvent.current)
            return;
        openedPendingEvent.current = false;
        window.dispatchEvent(new CustomEvent(PENDING_NAVIGATION_EVENT, { detail: null }));
    }, [isPending]);
    useEffect(() => {
        if (!isNavigating)
            return;
        const timer = setTimeout(() => setIsNavigating(false), 10000);
        return () => clearTimeout(timer);
    }, [isNavigating]);
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
        }
        catch {
        }
    }, [urlString, pathnames, router]);
    const triggerPointerDownPrefetch = useCallback(() => {
        if (!isCustom)
            return;
        doPrefetch();
    }, [isCustom, doPrefetch]);
    useEffect(() => {
        if (!isEager)
            return;
        const timer = setTimeout(doPrefetch, 100);
        return () => clearTimeout(timer);
    }, [urlString, isEager, doPrefetch]);
    const hoverTimerRef = useRef(null);
    const clearHoverTimer = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };
    const handleHoverStart = () => {
        if (!prefetchEnabled)
            return;
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
    const handleClick = (e) => {
        onClick?.(e);
        if (e.defaultPrevented)
            return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
            return;
        if (isCustom && (isNavigating || isPending)) {
            e.preventDefault();
            return;
        }
        if (isCustom) {
            const targetPath = typeof pathnames === 'string' ? pathnames : urlString;
            const targetPathname = targetPath.replace(/[?#].*$/, '');
            if (pathname !== targetPathname) {
                setIsNavigating(true);
                openedPendingEvent.current = true;
                window.dispatchEvent(new CustomEvent(PENDING_NAVIGATION_EVENT, { detail: targetPath }));
            }
            startTransition(() => {
                router.push(targetPath);
            });
            e.preventDefault();
        }
    };
    const effectivePrefetch = isCustom ? false : prefetch;
    return _jsx(LinkComponent, { ref: ref, href: pathnames, prefetch: effectivePrefetch, onClick: handleClick, onMouseEnter: (e) => {
            handleHoverStart();
            onMouseEnter?.(e);
        }, onMouseLeave: (e) => {
            handleHoverEnd();
            onMouseLeave?.(e);
        }, onPointerDown: (e) => {
            triggerPointerDownPrefetch();
            onPointerDown?.(e);
        }, ...rest });
}
const Link = forwardRef(CustomLinkFunction);
export default Link;

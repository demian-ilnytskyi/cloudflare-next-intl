"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

type ModuleLoader<P> = () => Promise<{ default: ComponentType<P> }>;

export interface LazyWrappingProviderResult<P extends Record<string, unknown>> {
    /** Always renders `children`, wrapping them in the real provider once resolved. */
    Provider: ComponentType<P & { children?: React.ReactNode }>;
    /**
     * `true` once the provider's chunk has resolved and it is actually
     * providing its context. Gate any sibling that reads that context via a
     * hook which throws when called outside its provider (e.g.
     * `useCookieConsent()`) behind this flag — such a sibling would crash if
     * it mounted during the (deliberately still-rendered) pending window,
     * since the JSX nesting under `<Provider>` does not yet correspond to a
     * real context boundary until this is `true`.
     */
    isReady: boolean;
}

// Loaders are module-scope constants at every real call site (see
// client_provider.tsx/client_provider_static.tsx), so once a loader's
// import() has settled, every future call anywhere in the app — this
// mount, a remount, a different route — can read the result synchronously
// during render instead of doing another effect+promise round trip.
// This also closes a one-commit reconciliation gap: without it, resolving
// asynchronously means the FIRST render returns bare `children` and a LATER
// render swaps in `<Resolved>{children}</Resolved>` — a different host
// element at the same tree position, which React can only apply by
// unmounting the old subtree and mounting the new one. That unmount/remount
// is a single atomic commit, but it means `children`'s underlying DOM node
// identity does not survive resolution — anything that captured a reference
// to it beforehand (an animation, a focus target, a stale test assertion)
// sees it detached. Serving an already-resolved module synchronously avoids
// ever taking that path in the common case (a warm import cache).
const settledCache = new Map<ModuleLoader<never>, ComponentType<never>>();

/**
 * Lazily loads a component that WRAPS `children` (an auth/consent provider,
 * say) without ever unmounting those children while the chunk downloads.
 *
 * `next/dynamic`'s `loading` option cannot render `children` — Next only
 * passes it `{ isLoading, error, pastDelay, retry, timedOut }` — so a
 * `dynamic()`-wrapped provider that wraps `children` renders `null` (i.e.
 * drops the whole subtree) until its chunk resolves. On a slow connection
 * that unmounts the entire app tree and paints a white screen, then remounts
 * it once the chunk lands.
 *
 * The returned `Provider` instead always renders `children` immediately,
 * and — once the underlying module has resolved — additionally wraps them
 * in the real provider. Its identity is created once per calling component
 * instance (via `useRef`, not on every render), so callers can use it
 * exactly like a normal component reference (`<Provider>{children}</Provider>`)
 * without triggering spurious remounts of what it wraps.
 *
 * The accompanying `isReady` flag tells callers when the provider's context
 * is actually live — see its own doc comment for why that matters.
 */
export default function useLazyWrappingProvider<P extends Record<string, unknown>>(
    loader: ModuleLoader<P>,
): LazyWrappingProviderResult<P> {
    const opaqueLoader = loader as unknown as ModuleLoader<never>;
    // Read synchronously during render — see settledCache's comment above.
    const resolvedRef = useRef<ComponentType<P> | null>(
        (settledCache.get(opaqueLoader) as unknown as ComponentType<P>) ?? null,
    );
    const [isReady, setIsReady] = useState(resolvedRef.current !== null);

    useEffect(() => {
        if (resolvedRef.current) return;
        let cancelled = false;
        loader().then((mod) => {
            if (cancelled) return;
            settledCache.set(opaqueLoader, mod.default as unknown as ComponentType<never>);
            resolvedRef.current = mod.default;
            setIsReady(true);
        });
        return () => {
            cancelled = true;
        };
        // `loader` is a module-scope constant at every real call site; this
        // effect intentionally runs once per mounted instance.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const wrapperRef = useRef<ComponentType<P & { children?: React.ReactNode }> | null>(null);
    if (!wrapperRef.current) {
        wrapperRef.current = function LazyWrappingProvider({ children, ...props }) {
            const Resolved = resolvedRef.current;
            if (!Resolved) return children as React.ReactElement;
            return <Resolved {...(props as P)}>{children}</Resolved>;
        };
    }

    return { Provider: wrapperRef.current, isReady };
}

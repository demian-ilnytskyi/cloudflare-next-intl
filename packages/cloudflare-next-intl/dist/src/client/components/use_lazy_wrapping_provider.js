"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
const settledCache = new Map();
export default function useLazyWrappingProvider(loader) {
    const opaqueLoader = loader;
    const resolvedRef = useRef(settledCache.get(opaqueLoader) ?? null);
    const [isReady, setIsReady] = useState(resolvedRef.current !== null);
    useEffect(() => {
        if (resolvedRef.current)
            return;
        let cancelled = false;
        loader().then((mod) => {
            if (cancelled)
                return;
            settledCache.set(opaqueLoader, mod.default);
            resolvedRef.current = mod.default;
            setIsReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const wrapperRef = useRef(null);
    if (!wrapperRef.current) {
        wrapperRef.current = function LazyWrappingProvider({ children, ...props }) {
            const Resolved = resolvedRef.current;
            if (!Resolved)
                return children;
            return _jsx(Resolved, { ...props, children: children });
        };
    }
    return { Provider: wrapperRef.current, isReady };
}

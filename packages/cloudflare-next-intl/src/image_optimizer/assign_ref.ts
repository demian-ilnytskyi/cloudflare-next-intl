import type React from "react";

/** Sets a callback or object ref, so a component can keep its own ref and still honour the caller's. */
export function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null): void {
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.RefObject<T | null>).current = node;
}

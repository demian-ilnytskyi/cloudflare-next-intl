"use client";
import { usePathname as nextUsePathname } from "next/navigation";
import { useLocale } from "./client_hooks";
/**
 * Client hook: like `next/navigation`'s `usePathname`, but with the locale
 * segment stripped — so `/de/about` returns `/about`, matching the
 * locale-agnostic paths used elsewhere in this package (e.g. `Link` href).
 * Must be used inside `IntlProvider`/`LocaleContext` (via {@link useLocale}).
 *
 * @returns The current pathname without its locale prefix (e.g. `/about`, or
 *   `/` for the root).
 */
export default function usePathname() {
    const pathname = nextUsePathname();
    const locale = useLocale();
    const path = pathname.replace(`/${locale}`, '');
    if (path) {
        return path;
    }
    else {
        return '/';
    }
}

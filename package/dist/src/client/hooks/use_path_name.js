"use client";
import { usePathname as nextUsePathname } from "next/navigation";
import { useLocale } from "./client_hooks.js";
export default function usePathname() {
    const pathname = nextUsePathname();
    const locale = useLocale();
    if (!pathname) {
        return '/';
    }
    const path = pathname.replace(`/${locale}`, '');
    if (path) {
        return path;
    }
    else {
        return '/';
    }
}

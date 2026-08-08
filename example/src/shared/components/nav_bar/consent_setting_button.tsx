"use client";

import { cn } from "@/lib/utils";
import useCookieConsent from "cloudflare-next-intl/useCookieConsent";

export default function ConsentSettingButton({ text }: { text: string }): Component | null {
    const { consent, requiresConsent, isMounted, setConsent } = useCookieConsent();

    if (!isMounted || !requiresConsent || consent === null) return null;

    return (
        <button
            type="button"
            onClick={() => setConsent(null)}
            className={cn(
                "flex items-center justify-center text-base hover:scale-105 duration-200",
                "px-3 py-1 rounded-2xl bg-cyan-100 dark:bg-cyan-900 dark:text-gray-300",
            )}
        >
            {text}
        </button>
    );
}

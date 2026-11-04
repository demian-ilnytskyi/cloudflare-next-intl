import type { Plugin } from "vite";

export interface AutoOptimizeDepsOptions {
    /**
     * Whether auto optimizeDeps is enabled.
     * @default true
     */
    enabled?: boolean;
    /**
     * Extra packages to include in optimizeDeps.include.
     */
    include?: string[];
    /**
     * Extra packages to exclude from optimizeDeps.exclude.
     */
    exclude?: string[];
}

export const DEFAULT_OPTIMIZE_DEPS_INCLUDE = [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "next/image",
    "next/dynamic",
    "next/link",
    "next/navigation",
];

export const DEFAULT_OPTIMIZE_DEPS_EXCLUDE = [
    "cloudflare-next-intl",
    "cloudflare-next-intl-intl",
    "cloudflare-next-intl-theme",
    "cloudflare-next-intl-auth",
    "cloudflare-next-intl-errors",
    "next/web-vitals",
    "next/server",
    "next/headers",
    "sonner",
    "lucide-react",
    "vinext",
];

export const DEFAULT_DEDUPE = ["react", "react-dom"];

export const DEFAULT_SSR_NO_EXTERNAL = [
    "cloudflare-next-intl",
    "cloudflare-next-intl-intl",
    "cloudflare-next-intl-theme",
    "cloudflare-next-intl-auth",
    "cloudflare-next-intl-errors",
];

export function autoOptimizeDepsPlugin(options?: AutoOptimizeDepsOptions): Plugin {
    const isEnabled = options?.enabled !== false;

    return {
        name: "cfni:auto-optimize-deps",
        config() {
            if (!isEnabled) return;

            return {
                resolve: {
                    dedupe: [...DEFAULT_DEDUPE],
                },
                ssr: {
                    noExternal: [...DEFAULT_SSR_NO_EXTERNAL],
                },
                optimizeDeps: {
                    include: [
                        ...DEFAULT_OPTIMIZE_DEPS_INCLUDE,
                        ...(options?.include ?? []),
                    ],
                    exclude: [
                        ...DEFAULT_OPTIMIZE_DEPS_EXCLUDE,
                        ...(options?.exclude ?? []),
                    ],
                },
            };
        },
    };
}


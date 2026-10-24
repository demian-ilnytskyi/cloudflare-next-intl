import type { Plugin } from "vite";

export const STATIC_NO_STORE_RULE = {
    source: "/_next/static/:path*",
    headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
};

const CONFIG_HEADERS_LITERAL = /(configHeaders:\s*|__configHeaders\s*=\s*)(\[[^\n]*\])(?=\s*[,;])/g;

export function appendStaticNoStoreRule(code: string): string {
    return code.replace(CONFIG_HEADERS_LITERAL, (_match, prefix: string, literal: string) =>
        `${prefix}${JSON.stringify([...JSON.parse(literal), STATIC_NO_STORE_RULE])}`,
    );
}

export function staticNotFoundNoStorePlugin(): Plugin {
    return {
        name: "cfni:static-not-found-no-store",
        transform(code, id) {
            if (!id.includes("virtual:vinext-")) return undefined;
            const next = appendStaticNoStoreRule(code);
            return next === code ? undefined : { code: next, map: null };
        },
    };
}

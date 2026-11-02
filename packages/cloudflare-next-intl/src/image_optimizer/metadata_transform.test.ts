import { describe, expect, it } from "vitest";
import {
    findBalancedBraces,
    getMetadataRanges,
    transformMetadataImageUrls,
} from "./metadata_transform.js";

describe("metadata_transform", () => {
    describe("findBalancedBraces", () => {
        it("finds matching brace in simple object", () => {
            const code = "const x = { a: 1, b: 2 };";
            const openIdx = code.indexOf("{");
            const closeIdx = findBalancedBraces(code, openIdx);
            expect(closeIdx).toBe(code.indexOf("}"));
        });

        it("handles nested braces and strings containing braces", () => {
            const code = 'const x = { a: "{ not closed }", b: { c: 3 } };';
            const openIdx = code.indexOf("{");
            const closeIdx = findBalancedBraces(code, openIdx);
            expect(closeIdx).toBe(code.lastIndexOf("}"));
        });

        it("handles comments with braces", () => {
            const code = 'const x = { // }\n/* } */ a: 1 };';
            const openIdx = code.indexOf("{");
            const closeIdx = findBalancedBraces(code, openIdx);
            expect(closeIdx).toBe(code.lastIndexOf("}"));
        });

        it("handles escaped quotes in strings and unclosed braces", () => {
            const code = 'const x = { a: "escaped \\" brace } still in string" };';
            const openIdx = code.indexOf("{");
            const closeIdx = findBalancedBraces(code, openIdx);
            expect(closeIdx).toBe(code.lastIndexOf("}"));

            expect(findBalancedBraces("not a brace", 0)).toBe(-1);
            expect(findBalancedBraces("{ unclosed brace", 0)).toBe(-1);
        });
    });

    describe("getMetadataRanges", () => {
        it("extracts ranges for metadata object", () => {
            const code = `
export const metadata: Metadata = {
    title: "Test",
    openGraph: {
        images: ["/images/logo.png"]
    }
};
`;
            const ranges = getMetadataRanges(code);
            expect(ranges.length).toBeGreaterThan(0);
            const snippet = code.slice(ranges[0].start, ranges[0].end + 1);
            expect(snippet).toContain('"/images/logo.png"');
        });

        it("extracts ranges for generateMetadata function", () => {
            const code = `
export async function generateMetadata() {
    return {
        openGraph: {
            images: ["/images/og.png"]
        }
    };
}
`;
            const ranges = getMetadataRanges(code);
            expect(ranges.length).toBeGreaterThan(0);
            const snippet = code.slice(ranges[0].start, ranges[0].end + 1);
            expect(snippet).toContain('"/images/og.png"');
        });

        it("extracts ranges for standalone openGraph / twitter / icons blocks", () => {
            const code = `
export const standalone = {
    openGraph: {
        images: ["/images/standalone.png"]
    }
};
`;
            const ranges = getMetadataRanges(code);
            expect(ranges.length).toBeGreaterThan(0);
        });
    });

    describe("transformMetadataImageUrls", () => {
        const manifest = {
            "/images/logo.png": { src: "/generated/images/logo.webp" },
            "/images/og.png": { src: "/generated/images/og.webp" },
        };

        it("rewrites image paths inside metadata object", () => {
            const code = `
export const metadata: Metadata = {
    title: "Test",
    twitter: {
        card: "summary_large_image",
        images: ["images/logo.png"]
    },
    openGraph: {
        images: ["/images/og.png"]
    },
    icons: {
        icon: "/images/logo.png"
    }
};
`;
            const transformed = transformMetadataImageUrls(code, manifest);
            expect(transformed).toBeDefined();
            expect(transformed).toContain('images: ["/generated/images/logo.webp"]');
            expect(transformed).toContain('images: ["/generated/images/og.webp"]');
            expect(transformed).toContain('icon: "/generated/images/logo.webp"');
            expect(transformed).not.toContain('"/images/logo.png"');
        });

        it("does not touch image paths outside metadata", () => {
            const code = `
const regularPath = "/images/logo.png";
export const metadata = {
    openGraph: {
        images: ["/images/og.png"]
    }
};
`;
            const transformed = transformMetadataImageUrls(code, manifest);
            expect(transformed).toBeDefined();
            expect(transformed).toContain('const regularPath = "/images/logo.png";');
            expect(transformed).toContain('images: ["/generated/images/og.webp"]');
        });

        it("returns undefined when no replacements are made", () => {
            const code = `
export const metadata = {
    title: "No images here"
};
`;
            expect(transformMetadataImageUrls(code, manifest)).toBeUndefined();
        });

        it("returns undefined for empty manifest, non-metadata code, or unreferenced images", () => {
            expect(transformMetadataImageUrls("const x = 1;", manifest)).toBeUndefined();
            expect(transformMetadataImageUrls("export const metadata = {};", {})).toBeUndefined();
            expect(transformMetadataImageUrls("const metadata = 'not an object';", manifest)).toBeUndefined();

            // Unreferenced image in metadata remains unchanged
            const code = `
export const metadata = {
    openGraph: {
        images: ["/images/unmatched.png"]
    }
};
`;
            expect(transformMetadataImageUrls(code, manifest)).toBeUndefined();
        });
    });
});


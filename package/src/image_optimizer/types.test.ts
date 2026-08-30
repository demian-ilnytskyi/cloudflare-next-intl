import { describe, it, expect } from "vitest";
import {
    DEFAULT_BLUR_OPTIONS,
    DEFAULT_OPTIONS,
    SUPPORTED_EXTENSIONS,
    resolveBlurOptions,
    resolveImageConfig,
    resolveOptions,
} from "./types.js";

describe("types & option resolvers", () => {
    it("resolveOptions returns defaults when given undefined", () => {
        expect(resolveOptions(undefined)).toEqual(DEFAULT_OPTIONS);
    });

    it("resolveOptions handles formats: false", () => {
        const resolved = resolveOptions({ formats: false });
        expect(resolved.formats).toEqual([]);
    });

    it("resolveOptions handles maxWidth: false", () => {
        const resolved = resolveOptions({ maxWidth: false });
        expect(resolved.maxWidth).toBe(false);
    });

    it("resolveOptions handles onlyUsed option", () => {
        const resolved = resolveOptions({ onlyUsed: false });
        expect(resolved.onlyUsed).toBe(false);
    });

    it("resolveOptions handles blur: false and blur: true", () => {
        const resolvedFalse = resolveOptions({ blur: false });
        expect(resolvedFalse.blur.enabled).toBe(false);

        const resolvedTrue = resolveOptions({ blur: true });
        expect(resolvedTrue.blur.enabled).toBe(true);
    });

    it("resolveBlurOptions merges custom properties and handles parent default", () => {
        const blur = resolveBlurOptions({ quality: 90, stdDeviation: 10 });
        expect(blur.enabled).toBe(true);
        expect(blur.quality).toBe(90);
        expect(blur.stdDeviation).toBe(10);
        expect(blur.size).toBe(DEFAULT_BLUR_OPTIONS.size);

        const blurOnlyEnabled = resolveBlurOptions({ enabled: true });
        expect(blurOnlyEnabled.size).toBe(DEFAULT_BLUR_OPTIONS.size);
        expect(blurOnlyEnabled.quality).toBe(DEFAULT_BLUR_OPTIONS.quality);
        expect(blurOnlyEnabled.stdDeviation).toBe(DEFAULT_BLUR_OPTIONS.stdDeviation);

        const blurWithParent = resolveBlurOptions(undefined, {
            enabled: false,
            size: 16,
            quality: 80,
            stdDeviation: 30,
        });
        expect(blurWithParent.enabled).toBe(false);
        expect(blurWithParent.size).toBe(16);
    });

    it("resolveImageConfig returns global settings without overrides", () => {
        const options = resolveOptions({ quality: 85, maxWidth: 1200 });
        const config = resolveImageConfig("/images/photo.png", options);
        expect(config.quality).toBe(85);
        expect(config.maxWidth).toBe(1200);
        expect(config.formats).toEqual(["webp"]);
        expect(config.blur.enabled).toBe(true);
    });

    it("resolveImageConfig applies per-image overrides correctly", () => {
        const options = resolveOptions({
            quality: 80,
            maxWidth: 1920,
            formats: ["avif", "webp"],
            overrides: {
                "/images/hero.png": {
                    maxWidth: false,
                    formats: ["webp"],
                    quality: 95,
                    blur: { quality: 80, stdDeviation: 15 },
                },
                "/images/logo.png": {
                    formats: false,
                    blur: false,
                },
                "/images/custom-size.png": {
                    maxWidth: 800,
                },
            },
        });

        const heroConfig = resolveImageConfig("/images/hero.png", options);
        expect(heroConfig.maxWidth).toBe(false);
        expect(heroConfig.formats).toEqual(["webp"]);
        expect(heroConfig.quality).toBe(95);
        expect(heroConfig.blur.enabled).toBe(true);
        expect(heroConfig.blur.quality).toBe(80);
        expect(heroConfig.blur.stdDeviation).toBe(15);

        const logoConfig = resolveImageConfig("/images/logo.png", options);
        expect(logoConfig.formats).toEqual([]);
        expect(logoConfig.blur.enabled).toBe(false);
        expect(logoConfig.maxWidth).toBe(1920);

        const sizeConfig = resolveImageConfig("/images/custom-size.png", options);
        expect(sizeConfig.maxWidth).toBe(800);
    });

    it("supported extensions include png, jpg, jpeg, webp, avif", () => {
        expect([...SUPPORTED_EXTENSIONS]).toEqual([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
    });

    describe("concurrency and effort options", () => {
        it("defaults concurrency to a clamped cpu count and effort to undefined", () => {
            const resolved = resolveOptions({});
            expect(resolved.concurrency).toBeGreaterThanOrEqual(1);
            expect(resolved.concurrency).toBeLessThanOrEqual(8);
            expect(resolved.effort).toBeUndefined();
        });

        it("honours explicit concurrency and effort", () => {
            const resolved = resolveOptions({ concurrency: 3, effort: 2 });
            expect(resolved.concurrency).toBe(3);
            expect(resolved.effort).toBe(2);
        });

        it("clamps a nonsensical concurrency to at least 1", () => {
            expect(resolveOptions({ concurrency: 0 }).concurrency).toBe(1);
        });

        it("lets a per-image override set effort", () => {
            const options = resolveOptions({ effort: 2, overrides: { "/images/a.png": { effort: 6 } } });
            expect(resolveImageConfig("/images/a.png", options).effort).toBe(6);
            expect(resolveImageConfig("/images/b.png", options).effort).toBe(2);
        });
    });
});

import { renderToString } from "react-dom/server";
import { Suspense, lazy } from "react";
import { describe, expect, it } from "vitest";
import LocaleProvider from "./locale_provider.js";
import { useLocale, useTranslations } from "../hooks/client_hooks.js";

function Consumer() {
    const t = useTranslations("A");
    return <span>{`${useLocale()}:${t("b")}`}</span>;
}

const Never = lazy(() => new Promise<never>(() => {}));

describe("LocaleProvider", () => {
    it("keeps hooks working when the lazy client provider suspends in SSR", () => {
        const html = renderToString(
            <LocaleProvider language="uk" messages={{ A: { b: "ok" } }}>
                <Suspense fallback={<Consumer />}><Never /></Suspense>
            </LocaleProvider>,
        );
        expect(html).toContain("uk:ok");
    });
});

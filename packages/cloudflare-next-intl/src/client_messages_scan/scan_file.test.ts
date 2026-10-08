import { describe, expect, it } from "vitest";
import { scanFile } from "./scan_file.js";

const imp = `import { useTranslations } from "cloudflare-next-intl/use";\n`;

describe("scanFile", () => {
    it("extracts literal namespace and trims to top level", () => {
        const r = scanFile("a.tsx", `${imp}const t = useTranslations("Contact.validation"); const u = useTranslations('Auth');`);
        expect(r.namespaces.sort()).toEqual(["Auth", "Contact"]);
        expect(r.dynamicCalls).toEqual([]);
    });
    it("ignores files without the hook import", () => {
        expect(scanFile("a.tsx", `const t = useTranslations("X");`).namespaces).toEqual([]);
    });
    it("handles aliased import", () => {
        const r = scanFile("a.tsx", `import { useTranslations as useT } from "cloudflare-next-intl/use";\nuseT("Header");`);
        expect(r.namespaces).toEqual(["Header"]);
    });
    it("works without 'use client' directive", () => {
        expect(scanFile("shared.tsx", `${imp}export function A(){ useTranslations("Shared"); }`).namespaces).toEqual(["Shared"]);
    });
    it("flags root access", () => {
        expect(scanFile("a.tsx", `${imp}useTranslations();`).usesRoot).toBe(true);
    });
    it("resolves ternary and no-substitution template literals", () => {
        const r = scanFile("a.tsx", `${imp}useTranslations(x ? "A" : \`B\`);`);
        expect(r.namespaces.sort()).toEqual(["A", "B"]);
    });
    it("resolves local const string", () => {
        expect(scanFile("a.tsx", `${imp}const NS = "Footer"; useTranslations(NS);`).namespaces).toEqual(["Footer"]);
    });
    it("resolves union-typed parameter", () => {
        const r = scanFile("a.tsx", `${imp}type C = "food" | "drinks"; function X({c}:{c:C}){ useTranslations(c); }`);
        expect(r.namespaces.sort()).toEqual(["drinks", "food"]);
    });
    it("resolves template expression with static prefix", () => {
        const r = scanFile("a.tsx", `${imp}useTranslations(\`Audit.fields.\${copyKey}\`);`);
        expect(r.namespaces).toEqual(["Audit"]);
        expect(r.dynamicCalls).toEqual([]);
    });
    it("reports unresolvable dynamic call with line", () => {
        const r = scanFile("a.tsx", `${imp}useTranslations(props.ns);`);
        expect(r.dynamicCalls).toEqual([{ file: "a.tsx", line: 2, text: "props.ns" }]);
    });
});

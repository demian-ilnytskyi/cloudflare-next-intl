import { describe, expect, it } from "vitest";
import { scanFile, findJsxPropValues } from "./scan_file.js";

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
    it("handles parenthesized and as expressions", () => {
        const r = scanFile("a.tsx", `${imp}useTranslations(("A" as string));`);
        expect(r.namespaces).toEqual(["A"]);
    });
    it("handles ternary with unresolvable branch", () => {
        const r = scanFile("a.tsx", `${imp}useTranslations(x ? "A" : unknownVar);`);
        expect(r.dynamicCalls).toHaveLength(1);
    });
    it("resolves direct parameter typed as union", () => {
        const r = scanFile("a.tsx", `${imp}function Comp(ns: "One" | "Two") { useTranslations(ns); }`);
        expect(r.namespaces.sort()).toEqual(["One", "Two"]);
    });
    it("resolves renamed and inlined type literal destructured props", () => {
        const r = scanFile("a.tsx", `${imp}function Comp({ ns: myNs }: { ns: "Alpha" | "Beta" }) { useTranslations(myNs); }`);
        expect(r.namespaces.sort()).toEqual(["Alpha", "Beta"]);
    });
    it("associates dynamic call prop for arrow function and function expression components", () => {
        const codeArrow = `${imp}const ArrowComp = ({ propKey }: { propKey: string }) => { useTranslations(propKey); };`;
        const rArrow = scanFile("a.tsx", codeArrow);
        expect(rArrow.dynamicCalls[0]?.prop).toEqual({ component: "ArrowComp", name: "propKey" });

        const codeFuncExpr = `${imp}const FuncComp = function({ propKey }: { propKey: string }) { useTranslations(\`\${propKey}\`); };`;
        const rFunc = scanFile("a.tsx", codeFuncExpr);
        expect(rFunc.dynamicCalls[0]?.prop).toEqual({ component: "FuncComp", name: "propKey" });
    });
    it("handles non-string union and non-matching types gracefully", () => {
        const r = scanFile("a.tsx", `${imp}function Comp({ x }: { x: "S" | number }) { useTranslations(x as unknown as string); }`);
        expect(r.dynamicCalls).toHaveLength(1);
    });
    it("handles anonymous function component and unassociated identifiers or templates", () => {
        const anon = `${imp}export default function({ prop }: { prop: string }) { useTranslations(unresolvedId); useTranslations(\`\${unresolvedTemplate}\`); }`;
        const r = scanFile("a.tsx", anon);
        expect(r.dynamicCalls).toHaveLength(2);
        expect(r.dynamicCalls[0]?.prop).toBeUndefined();
        expect(r.dynamicCalls[1]?.prop).toBeUndefined();
    });
    it("handles non-identifier destructured elements and deep recursion", () => {
        const code = `${imp}function Comp({ prop: [a, b] }: { prop: string[] }) { useTranslations(((((((("Deep")))))))); }`;
        const r = scanFile("a.tsx", code);
        expect(r.dynamicCalls).toHaveLength(1);
    });
    it("tests findJsxPropValues for non-tsx file extensions and ignored attributes", () => {
        expect(findJsxPropValues("file.ts", `<Comp other="x" prop="val" />`, "Comp", "prop")).toEqual([]);
        expect(findJsxPropValues("file.tsx", `<Comp other="x" prop="val" />`, "Comp", "prop")).toEqual(["val"]);
    });
});




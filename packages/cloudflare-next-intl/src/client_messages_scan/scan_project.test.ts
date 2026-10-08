import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanProject, matchesNamespacePattern } from "./scan_project.js";

const imp = `import { useTranslations } from "cloudflare-next-intl/use";\n`;
function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "cfni-scan-"));
    for (const [p, c] of Object.entries(files)) {
        mkdirSync(join(root, p, ".."), { recursive: true });
        writeFileSync(join(root, p), c);
    }
    return root;
}

describe("scanProject", () => {
    it("aggregates namespaces across files, sorted and unique", () => {
        const root = fixture({ "src/a.tsx": `${imp}useTranslations("B");`, "src/b.tsx": `${imp}useTranslations("A"); useTranslations("B");` });
        expect(scanProject({ root }).namespaces).toEqual(["A", "B"]);
    });
    it("skips test files and node_modules", () => {
        const root = fixture({ "src/a.test.tsx": `${imp}useTranslations("T");`, "src/node_modules/x/a.tsx": `${imp}useTranslations("N");` });
        expect(scanProject({ root }).namespaces).toEqual([]);
    });
    it("root access sends all", () => {
        expect(scanProject({ root: fixture({ "src/a.tsx": `${imp}useTranslations();` }) }).namespaces).toBe(true);
    });
    it("dynamic call sends all by default", () => {
        expect(scanProject({ root: fixture({ "src/a.tsx": `${imp}useTranslations(p.ns);` }) }).namespaces).toBe(true);
    });
    it("dynamic call with onDynamic=fallback uses fallbackNamespaces", () => {
        const root = fixture({ "src/a.tsx": `${imp}useTranslations(p.ns); useTranslations("X");` });
        const m = scanProject({ root, onDynamic: "fallback", fallbackNamespaces: ["Common"] });
        expect(m.namespaces).toEqual(["Common", "X"]);
        expect(m.dynamicCalls).toHaveLength(1);
    });
    it("reads package.json i18n manifest", () => {
        const root = fixture({ "node_modules/@ui/kit/package.json": JSON.stringify({ name: "@ui/kit", i18n: { namespaces: ["Buttons"] } }) });
        expect(scanProject({ root, packages: ["@ui/kit"] }).namespaces).toEqual(["Buttons"]);
    });
    it("scans package source when no manifest", () => {
        const root = fixture({ "node_modules/kit/package.json": `{"name":"kit"}`, "node_modules/kit/dist/a.js": `${imp}useTranslations("Kit");` });
        expect(scanProject({ root, packages: ["kit"] }).namespaces).toEqual(["Kit"]);
    });
    it("skips missing package and supports custom dirs", () => {
        const root = fixture({ "custom_dir/a.tsx": `${imp}useTranslations("Custom");` });
        expect(scanProject({ root, packages: ["nonexistent_pkg"], dirs: ["custom_dir"] }).namespaces).toEqual(["Custom"]);
    });
});


describe("matchesNamespacePattern", () => {
    it("matches exact and trailing wildcard", () => {
        expect(matchesNamespacePattern("Errors", "Errors")).toBe(true);
        expect(matchesNamespacePattern("CategoriesFood", "Categories*")).toBe(true);
        expect(matchesNamespacePattern("Other", "Categories*")).toBe(false);
    });
});

describe("scanProject prop-driven namespaces", () => {
    const field = `${imp}export default function EmailField({ messagesKey }: { messagesKey: string }) { useTranslations(\`\${messagesKey}.validation\`); }`;
    it("resolves namespace from JSX call sites", () => {
        const root = fixture({ "src/field.tsx": field, "src/login.tsx": `export default () => <><EmailField messagesKey="LoginScreen" /><EmailField messagesKey={"SignUpScreen"}></EmailField></>;` });
        const m = scanProject({ root, onDynamic: "fallback" });
        expect(m.namespaces).toEqual(["LoginScreen", "SignUpScreen"]);
        expect(m.dynamicCalls).toEqual([]);
    });
    it("stays dynamic when a call site passes a non-literal", () => {
        const root = fixture({ "src/field.tsx": field, "src/login.tsx": `export default ({ k }) => <EmailField messagesKey={k} />;` });
        expect(scanProject({ root }).namespaces).toBe(true);
    });
    it("stays dynamic when a call site spreads props", () => {
        const root = fixture({ "src/field.tsx": field, "src/login.tsx": `export default (p) => <EmailField {...p} />;` });
        expect(scanProject({ root }).namespaces).toBe(true);
    });
    it("stays dynamic when component is never rendered with JSX", () => {
        expect(scanProject({ root: fixture({ "src/field.tsx": field }) }).namespaces).toBe(true);
    });
});

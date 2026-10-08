import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Plugin } from "vite";
import { autoClientMessagesPlugin } from "./auto_client_messages_plugin.js";
import { cloudflareNextIntl } from "./plugin.js";

const imp = `import { useTranslations } from "cloudflare-next-intl/use";\n`;
function root(code: string): string {
    const r = mkdtempSync(join(tmpdir(), "cfni-acm-"));
    mkdirSync(join(r, "src"));
    writeFileSync(join(r, "src/a.tsx"), code);
    return r;
}
const callConfig = (p: Plugin): { define: Record<string, string> } => {
    if (typeof p.config === "function") {
        return (p.config as (config: unknown, env: { command: "build" | "serve"; mode: string }) => { define: Record<string, string> })({}, { command: "build", mode: "production" });
    }
    const handler = (p.config as { handler: (config: unknown, env: { command: "build" | "serve"; mode: string }) => { define: Record<string, string> } }).handler;
    return handler({}, { command: "build", mode: "production" });
};

describe("autoClientMessagesPlugin", () => {
    it("injects manifest via define", () => {
        const out = callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations("Auth");`) }));
        expect(out.define.__CFNI_CLIENT_MESSAGES__).toBe(JSON.stringify(["Auth"]));
    });
    it("injects fallback namespaces on dynamic call by default", () => {
        const out = callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations(p.x);`), fallbackNamespaces: ["Fallback"] }));
        expect(out.define.__CFNI_CLIENT_MESSAGES__).toBe(JSON.stringify(["Fallback"]));
    });
    it("injects true on dynamic call when onDynamic is all", () => {
        const out = callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations(p.x);`), onDynamic: "all" }));
        expect(out.define.__CFNI_CLIENT_MESSAGES__).toBe("true");
    });
    it("strict throws on dynamic call", () => {
        expect(() => callConfig(autoClientMessagesPlugin({ root: root(`${imp}useTranslations(p.x);`), strict: true }))).toThrow(/Dynamic useTranslations/);
    });
    it("hot update rescans and reloads when namespaces change", () => {
        const r = root(`${imp}useTranslations("A");`);
        const p = autoClientMessagesPlugin({ root: r });
        callConfig(p);
        writeFileSync(join(r, "src/a.tsx"), `${imp}useTranslations("B");`);
        const server = { config: { define: {} as Record<string, string> }, ws: { send: vi.fn() } };
        p.handleHotUpdate({ file: join(r, "src/a.tsx"), server });
        expect(server.config.define.__CFNI_CLIENT_MESSAGES__).toBe(JSON.stringify(["B"]));
        expect(server.ws.send).toHaveBeenCalledWith({ type: "full-reload" });
    });
    it("hot update ignores non-source files and unchanged namespace results", () => {
        const r = root(`${imp}useTranslations("A");`);
        const p = autoClientMessagesPlugin({ root: r });
        callConfig(p);
        const server = { config: { define: {} as Record<string, string> }, ws: { send: vi.fn() } };
        p.handleHotUpdate({ file: join(r, "README.md"), server });
        expect(server.ws.send).not.toHaveBeenCalled();

        p.handleHotUpdate({ file: join(r, "src/a.tsx"), server });
        expect(server.ws.send).not.toHaveBeenCalled();
    });
    it("uses default root and logs correctly", () => {
        const p = autoClientMessagesPlugin();
        const out = callConfig(p);
        expect(out.define.__CFNI_CLIENT_MESSAGES__).toBeDefined();
    });
    it("is on by default in cloudflareNextIntl()", () => {
        expect(cloudflareNextIntl().some((p) => p.name === "cloudflare-next-intl-auto-client-messages")).toBe(true);
        expect(cloudflareNextIntl({ autoClientMessages: false }).some((p) => p.name === "cloudflare-next-intl-auto-client-messages")).toBe(false);
    });
});

import { describe, it, expect } from "vitest";
import { userAgentStubPlugin, USER_AGENT_STUB_ID, USER_AGENT_STUB_CODE } from "./user_agent_stub.js";

describe("userAgentStubPlugin", () => {
    it("has correct plugin metadata", () => {
        const plugin = userAgentStubPlugin();
        expect(plugin.name).toBe("cfni:user-agent-stub");
        expect(plugin.enforce).toBe("pre");
    });

    it("resolves next/dist/server/web/spec-extension/user-agent", () => {
        const plugin = userAgentStubPlugin();
        const resolveId = plugin.resolveId as any;

        expect(resolveId("next/dist/server/web/spec-extension/user-agent")).toBe(USER_AGENT_STUB_ID);
        expect(resolveId("node_modules/next/dist/server/web/spec-extension/user-agent")).toBe(USER_AGENT_STUB_ID);
        expect(resolveId("other-module")).toBeUndefined();
    });

    it("loads virtual user-agent stub module code", () => {
        const plugin = userAgentStubPlugin();
        const load = plugin.load as any;

        expect(load(USER_AGENT_STUB_ID)).toBe(USER_AGENT_STUB_CODE);
        expect(load("other-module")).toBeUndefined();
    });

    it("evaluates stub functions correctly", () => {
        const executableCode = USER_AGENT_STUB_CODE
            .replace(/export function /g, "function ")
            .replace(/export default \{[\s\S]*?\};/, "");
        const fn = new Function(`${executableCode}; return { isBot, userAgent, userAgentFromString };`);
        const { isBot, userAgent, userAgentFromString } = fn();

        expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
        expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
        expect(isBot("")).toBe(false);
        expect(isBot(null)).toBe(false);
        expect(isBot(undefined)).toBe(false);

        const ua = userAgentFromString("test-ua");
        expect(ua.ua).toBe("test-ua");
        expect(ua.isBot).toBe(false);

        const uaEmpty = userAgentFromString(undefined);
        expect(uaEmpty.ua).toBe("");
        expect(uaEmpty.isBot).toBe(false);

        const uaFromHeaders = userAgent({ headers: new Headers({ "user-agent": "Googlebot" }) });
        expect(uaFromHeaders.isBot).toBe(true);

        const uaNoHeaders = userAgent({});
        expect(uaNoHeaders.ua).toBe("");
    });
});

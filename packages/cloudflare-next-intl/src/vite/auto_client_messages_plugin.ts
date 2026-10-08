import type { Plugin } from "vite";
import { scanProject, type ScanProjectOptions, type ClientMessagesManifest } from "../client_messages_scan/scan_project.js";

export interface AutoClientMessagesOptions extends Partial<Omit<ScanProjectOptions, "root">> { root?: string; strict?: boolean }

const KEY = "__CFNI_CLIENT_MESSAGES__";
const SOURCE = /\.(tsx?|jsx?|mjs)$/;

export function autoClientMessagesPlugin(options: AutoClientMessagesOptions = {}): Plugin {
    const opts: AutoClientMessagesOptions = {
        onDynamic: "fallback",
        fallbackNamespaces: [],
        ...options,
    };
    let last = "";
    const run = (): string => {
        const manifest: ClientMessagesManifest = scanProject({ ...opts, root: opts.root ?? process.cwd() });
        for (const d of manifest.dynamicCalls) console.warn(`[cloudflare-next-intl] dynamic useTranslations: ${d.file}:${d.line} ${d.text}`);
        if (opts.strict && manifest.dynamicCalls.length > 0) throw new Error("[cloudflare-next-intl] Dynamic useTranslations namespaces found. Use literals, union types, or fallbackNamespaces with onDynamic: \"fallback\".");
        console.log(manifest.namespaces === true
            ? `[cloudflare-next-intl] client messages: sending all (root or dynamic access) from ${manifest.scannedFiles} files`
            : `[cloudflare-next-intl] client messages: ${manifest.namespaces.length} namespaces from ${manifest.scannedFiles} files`);
        return JSON.stringify(manifest.namespaces);
    };
    return {
        name: "cloudflare-next-intl-auto-client-messages",
        config() {
            last = run();
            return { define: { [KEY]: last } };
        },
        handleHotUpdate({ file, server }) {
            if (!SOURCE.test(file)) return;
            const next = run();
            if (next === last) return;
            last = next;
            (server.config.define as Record<string, string>)[KEY] = next;
            server.ws.send({ type: "full-reload" });
        },
    };
}

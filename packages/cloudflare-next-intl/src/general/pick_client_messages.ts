import type { TranslationObject } from "../types/types.js";
import { matchesNamespacePattern } from "../client_messages_scan/match_namespace.js";

declare const __CFNI_CLIENT_MESSAGES__: string[] | true | undefined;

function readAutoManifest(): string[] | true | undefined {
    return typeof __CFNI_CLIENT_MESSAGES__ === "undefined" ? undefined : __CFNI_CLIENT_MESSAGES__;
}

export default function pickClientMessages(messages: TranslationObject, clientMessages: boolean | "auto" | readonly string[] | undefined = "auto", autoManifest: string[] | true | undefined = readAutoManifest()): TranslationObject {
    const effective = clientMessages ?? "auto";
    const list = effective === "auto" ? autoManifest ?? true : effective;
    if (list === undefined || list === true) return messages;
    const picked: TranslationObject = {};
    if (list === false) return picked;
    for (const namespace of Object.keys(messages)) {
        if (list.some((p) => matchesNamespacePattern(namespace, p))) picked[namespace] = messages[namespace];
    }
    return picked;
}

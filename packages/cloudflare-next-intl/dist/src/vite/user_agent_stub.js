export const USER_AGENT_STUB_ID = "\0cfni:user-agent-stub";
export const USER_AGENT_STUB_CODE = `
export function isBot(input) {
    if (!input) return false;
    return /Googlebot|Mediapartners-Google|AdsBot-Google|googleweblight|Storebot-Google|Google-PageRenderer|Google-InspectionTool|Bingbot|BingPreview|Slurp|DuckDuckBot|baiduspider|yandex|sogou|LinkedInBot|bitlybot|tumblr|vkShare|quora link preview|facebookexternalhit|facebookcatalog|Twitterbot|applebot|redditbot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|ia_archiver|GPTBot/i.test(
        input
    );
}

export function userAgentFromString(input) {
    return {
        ua: input ?? "",
        browser: { name: undefined, version: undefined, major: undefined },
        cpu: { architecture: undefined },
        device: { model: undefined, type: undefined, vendor: undefined },
        engine: { name: undefined, version: undefined },
        os: { name: undefined, version: undefined },
        isBot: input === undefined ? false : isBot(input),
    };
}

export function userAgent(context) {
    const headers = context?.headers;
    const ua = headers?.get ? headers.get("user-agent") : undefined;
    return userAgentFromString(ua ?? undefined);
}

export default {
    isBot,
    userAgent,
    userAgentFromString,
};
`;
export function userAgentStubPlugin() {
    return {
        name: "cfni:user-agent-stub",
        enforce: "pre",
        resolveId(id) {
            if (id === "next/dist/server/web/spec-extension/user-agent" || id.endsWith("/spec-extension/user-agent")) {
                return USER_AGENT_STUB_ID;
            }
        },
        load(id) {
            if (id === USER_AGENT_STUB_ID) {
                return USER_AGENT_STUB_CODE;
            }
        },
    };
}

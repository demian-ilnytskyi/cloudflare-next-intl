import type { Plugin } from "vite";

export const BUFFER_STUB_ID = "\0cfni:buffer-stub";

/**
 * Stubs node:buffer in client (browser) builds with the real `buffer` npm
 * polyfill. vinext's `fetch-cache.js` shim (reached via a "use server"
 * action's client reference importing `next/cache`) calls `Buffer.from(...)`
 * for real base64 encode/decode work, so — unlike vinext's own
 * `async-hooks-stub` plugin, where an inert no-op class is semantically
 * correct — a no-op here would silently corrupt data. Vite's default
 * `__vite-browser-external` stub for `node:buffer` throws on any property
 * access, which is what crashes without this.
 */
export function bufferStubPlugin(): Plugin {
    return {
        name: "cfni:buffer-stub",
        enforce: "pre",
        resolveId(id, _importer, options) {
            if (
                id === "node:buffer" &&
                (this.environment?.name === "client" || options?.ssr === false)
            ) {
                return BUFFER_STUB_ID;
            }
        },
        load(id) {
            if (id === BUFFER_STUB_ID) {
                return `import bufferModule, { Buffer } from "buffer";\nexport { Buffer };\nexport default bufferModule;`;
            }
        },
        config() {
            return {
                optimizeDeps: {
                    include: ["buffer"],
                },
            };
        },
    };
}

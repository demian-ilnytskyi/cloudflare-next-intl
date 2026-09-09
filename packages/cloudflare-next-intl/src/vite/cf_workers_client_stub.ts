import type { Plugin } from "vite";

export const CF_WORKERS_CLIENT_STUB_ID = "\0cfni:cloudflare-workers-client-stub";

export const CF_WORKERS_CLIENT_STUB_CODE = `
export class WorkerEntrypoint {}
export class DurableObject {}
export const env = {};
export default {};
`;

export function cfWorkersClientStubPlugin(): Plugin {
    return {
        name: "cfni:cf-workers-client-stub",
        enforce: "pre",
        resolveId(id, _importer, options) {
            if (id === "cloudflare:workers" && (this.environment?.name === "client" || options?.ssr === false)) {
                return CF_WORKERS_CLIENT_STUB_ID;
            }
        },
        load(id) {
            if (id === CF_WORKERS_CLIENT_STUB_ID) {
                return CF_WORKERS_CLIENT_STUB_CODE;
            }
        },
    };
}

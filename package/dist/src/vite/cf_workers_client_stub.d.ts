import type { Plugin } from "vite";
export declare const CF_WORKERS_CLIENT_STUB_ID = "\0cfni:cloudflare-workers-client-stub";
export declare const CF_WORKERS_CLIENT_STUB_CODE = "\nexport class WorkerEntrypoint {}\nexport class DurableObject {}\nexport const env = {};\nexport default {};\n";
export declare function cfWorkersClientStubPlugin(): Plugin;

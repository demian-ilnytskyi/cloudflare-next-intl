import type { ReportErrorConfig } from './report_error.js';

// Module-scope, mirroring `setStaleDeployPatterns`/`getStaleDeployPatterns`:
// safe because it is written once per isolate at cold start (alongside your
// `RoutingConfig` definition), not per request.
let config: ReportErrorConfig | undefined;

/**
 * Registers the config the ready-made `reportClientError` action reports
 * through, so it can be imported and used directly — no per-app `"use
 * server"` wrapper file needed. Call once, e.g. alongside your
 * `RoutingConfig`:
 *
 * ```ts
 * // intl_config.ts
 * import { setErrorHandlingActionConfig } from "cloudflare-next-intl/errorHandling";
 * const intlConfig = { errorHandling: { onError }, generate: { ... } };
 * setErrorHandlingActionConfig(intlConfig);
 * export default intlConfig;
 * ```
 *
 * Prefer `createServerErrorAction` instead if you'd rather bind config
 * explicitly per call than rely on this module-scope registration.
 */
export function setErrorHandlingActionConfig(next: ReportErrorConfig | undefined): void {
    config = next;
}

export function getErrorHandlingActionConfig(): ReportErrorConfig | undefined {
    return config;
}

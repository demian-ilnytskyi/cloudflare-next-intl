import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';
import reportError, { type ReportErrorConfig } from '../error_handling/report_error.js';
import type { GenerateRoutingConfig } from '../types/types.js';

const MAX_ERROR_BODY_LENGTH = 500;

/**
 * Full parity with `portfolio/src/shared/repositories/site_fetch_repository.ts`'s
 * `fetchTextData`: fetches `input` (via `fetchWithCloudflareFallback`),
 * reports (never throws) on a non-ok response or a thrown error, and
 * returns `null` in both failure cases so a caller always gets either the
 * body text or a clean "couldn't fetch it" signal.
 *
 * @param config Pass `{ generate: yourRoutingConfig.generate, errorHandling: yourRoutingConfig.errorHandling }`.
 * @param reportAs The label the failure is reported under (see `reportError`'s `classOrMethodName`).
 */
export async function fetchText(
    input: RequestInfo | URL,
    init: RequestInit,
    config: (ReportErrorConfig & { generate?: GenerateRoutingConfig }) | undefined,
    reportAs: string,
): Promise<string | null> {
    try {
        const response = await fetchWithCloudflareFallback(input, init, config?.generate);
        if (!response.ok) {
            const body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
            throw new Error(body || `HTTP ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        await reportError(config, { error, classOrMethodName: reportAs, params: { input: String(input) } });
        return null;
    }
}

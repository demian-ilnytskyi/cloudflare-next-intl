import { fetchWithCloudflareFallback } from './fetch_with_fallback.js';
import reportError from '../error_handling/report_error.js';
const MAX_ERROR_BODY_LENGTH = 500;
export async function fetchText(input, init, config, reportAs) {
    try {
        const response = await fetchWithCloudflareFallback(input, init, config?.generate);
        if (!response.ok) {
            const body = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
            throw new Error(body || `HTTP ${response.status}`);
        }
        return await response.text();
    }
    catch (error) {
        await reportError(config, { error, classOrMethodName: reportAs, params: { input: String(input) } });
        return null;
    }
}

import { reportClientErrorCore } from './report_client_error_core.js';
export default function createServerErrorAction(config) {
    return async function reportClientError(error, classOrMethodName, params) {
        await reportClientErrorCore(config, error, classOrMethodName, params);
    };
}

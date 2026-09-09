'use server';
import config from '@intl-config';
import { reportClientErrorCore } from './report_client_error_core.js';
export default async function reportClientError(error, classOrMethodName, params) {
    await reportClientErrorCore(config, error, classOrMethodName, params);
}

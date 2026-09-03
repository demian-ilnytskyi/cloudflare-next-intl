'use server';

import type { ErrorHandlingParams } from '../types/types.js';
import { getErrorHandlingActionConfig } from './error_handling_action_config.js';
import { reportClientErrorCore } from './report_client_error_core.js';

/**
 * Ready-made server action reporting a client-originated error through the
 * config registered via `setErrorHandlingActionConfig` (call that once,
 * before this ever runs). Import and call it directly from client code —
 * unlike `createServerErrorAction`, no per-app `"use server"` wrapper file
 * is needed, since `"use server"` already lives here, in the package.
 */
export default async function reportClientError(
    error: unknown,
    classOrMethodName: string,
    params?: ErrorHandlingParams['params'],
): Promise<void> {
    await reportClientErrorCore(getErrorHandlingActionConfig(), error, classOrMethodName, params);
}

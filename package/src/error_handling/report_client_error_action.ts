'use server';

import type { ErrorHandlingParams } from '../types/types.js';
import type { ReportErrorConfig } from './report_error.js';
import config from '@intl-config';
import { reportClientErrorCore } from './report_client_error_core.js';

/**
 * Ready-made server action reporting a client-originated error through
 * `@intl-config` — the same virtual alias every consuming app already points
 * at its own `RoutingConfig` (README "Setup" step 2), same as `db`/
 * `clearSessionAction`. Import and call it directly from client code with no
 * setup beyond that: unlike `createServerErrorAction`, no per-app `"use
 * server"` wrapper file, and no separate registration call either.
 */
export default async function reportClientError(
    error: unknown,
    classOrMethodName: string,
    params?: ErrorHandlingParams['params'],
): Promise<void> {
    await reportClientErrorCore(config as ReportErrorConfig, error, classOrMethodName, params);
}

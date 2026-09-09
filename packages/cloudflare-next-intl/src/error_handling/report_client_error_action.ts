'use server';

import type { ErrorHandlingParams } from '../types/types.js';
import type { ReportErrorConfig } from './report_error.js';
import config from '@intl-config';
import { reportClientErrorCore } from './report_client_error_core.js';

/**
 * Ready-made server action reporting a client-originated error through
 * `@intl-config` — the same virtual alias every consuming app already points
 * at its own `RoutingConfig` (README "Setup" step 2), same as `db`/
 * `clearSessionAction`. Unlike `createServerErrorAction`, no per-app `"use
 * server"` wrapper file, and no separate registration call either.
 *
 * `error` IS A STRING, AND THE TYPE IS LOAD-BEARING: React serialises a
 * server action's arguments, and an `Error` instance does not survive that —
 * it arrives here as a `$$typeof` stub with nothing of the failure left on
 * it. Client code calls `report_client_error.ts` instead, which stringifies
 * in the browser and then calls this. Do not widen the parameter back to
 * `unknown`.
 */
export default async function reportClientError(
    error: string,
    classOrMethodName: string,
    params?: ErrorHandlingParams['params'],
): Promise<void> {
    await reportClientErrorCore(config as ReportErrorConfig, error, classOrMethodName, params);
}

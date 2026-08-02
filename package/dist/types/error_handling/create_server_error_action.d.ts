import type { ErrorHandlingParams } from '../types/types';
import { type ReportErrorConfig } from './report_error';
/**
 * Creates a `"use server"` action that reports a client-originated error via
 * `reportError`, so `config` (and anything it closes over — secrets,
 * `Secrets.telegramBotToken`-style env reads inside your `onError`) never
 * has to be imported into client-side code. Call this once (server-side,
 * e.g. next to your `RoutingConfig`) and pass the returned function to
 * client components that need to report an error — they only ever handle
 * the error value itself, never `config`.
 *
 * The error is stringified before crossing the client→server action
 * boundary (Next.js server actions serialize arguments; an `Error` instance
 * doesn't survive that intact) and `isClient: true` is set automatically.
 *
 * @param config Pass the relevant slices of your `RoutingConfig` directly —
 *   `{ errorHandling: config.errorHandling, generate: config.generate }`.
 */
export default function createServerErrorAction(config: ReportErrorConfig | undefined): (error: unknown, classOrMethodName: string, params?: ErrorHandlingParams["params"]) => Promise<void>;

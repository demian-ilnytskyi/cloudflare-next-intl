import { type ReportErrorConfig } from './report_error.js';
export declare const EMPTY_CONSOLE_ERROR_MESSAGE = "console.error called with no message";
export default function installConsoleErrorOverride(config: ReportErrorConfig | undefined, isClient?: boolean): void;

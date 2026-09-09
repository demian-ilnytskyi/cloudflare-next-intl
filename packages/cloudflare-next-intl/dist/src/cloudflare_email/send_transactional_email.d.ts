import { type ReportErrorConfig } from '../error_handling/report_error.js';
import type { GenerateRoutingConfig } from '../types/types.js';
export type TransactionalEmailOutcome = 'sent' | 'unavailable' | 'failed';
export interface TransactionalEmailContent {
    subject: string;
    text: string;
    html: string;
}
export interface SendTransactionalEmailOptions extends ReportErrorConfig {
    generate?: GenerateRoutingConfig;
    senderAddress: string;
    bindingName?: string;
    restAccountId?: string;
    restToken?: string;
}
export declare function sendTransactionalEmail(message: {
    to: string;
} & TransactionalEmailContent, options: SendTransactionalEmailOptions, reportAs: string): Promise<TransactionalEmailOutcome>;

import type { GenerateRoutingConfig } from '../types/types.js';
export interface EmailBindingLike {
    send(message: {
        to: string;
        from: string;
        subject: string;
        html?: string;
        text?: string;
    }): Promise<unknown>;
}
export declare function resolveEmailBinding(generate?: GenerateRoutingConfig, bindingName?: string): Promise<EmailBindingLike | null>;

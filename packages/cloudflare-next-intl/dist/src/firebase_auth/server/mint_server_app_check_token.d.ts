import type { FirebaseAppCheckConfig } from '../../types/types.js';
export declare const missingCredentialsReportState: {
    reported: boolean;
};
export default function mintServerAppCheckToken(projectId: string, apiKey: string, appCheck: FirebaseAppCheckConfig | undefined): Promise<string | undefined>;

import KTextConstants from "@/shared/constants/variables/text_constants";
import { setIntlConfig } from "cloudflare-next-intl";
import { getCloudflareContext } from "@opennextjs/cloudflare";

declare global {
    type Language = "uk" | "en";
}

const intlConfig = setIntlConfig({
    locales: KTextConstants.locales,
    defaultLocale: KTextConstants.defaultLocale,
    firebaseAuth: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        redirectAuthPath: '/login',
        homePath: '/',
        isAuthPath: (path: string) => path === '/login',
    } : undefined,
    generate: {
        getCloudflareContext: getCloudflareContext,
    },
    cookieConsent: {
        privacyPolicyDate: "2026-01-05",
        analytics: {}
    },
    errorHandling: {
        overrideConsoleError: true,
    },
});
export default intlConfig;

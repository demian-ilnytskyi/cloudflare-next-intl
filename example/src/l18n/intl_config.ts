import KTextConstants from "@/shared/constants/variables/text_constants";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { setIntlConfig } from "cloudflare-next-intl";

declare global {
    type Language = "uk" | "en";
}

const intlConfig = setIntlConfig({
    locales: KTextConstants.locales,
    defaultLocale: KTextConstants.defaultLocale,
    cookieConsent: {
        privacyPolicyDate: "2026-01-01",
        getCloudflareContext: getCloudflareContext,
    },
});
export default intlConfig;

import KTextConstants from "@/shared/constants/variables/text_constants";
import { setIntlConfig } from "cloudflare-next-intl";

declare global {
    type Language = "uk" | "en";
}

const intlConfig = setIntlConfig({
    locales: KTextConstants.locales,
    defaultLocale: KTextConstants.defaultLocale,
});
export default intlConfig;

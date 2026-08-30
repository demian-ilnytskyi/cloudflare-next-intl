import config from "../../config/intl_config.js";
export function getLocaleStaticParams() {
    return config.locales.map((locale) => ({ locale }));
}

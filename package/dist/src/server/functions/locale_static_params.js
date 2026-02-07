import config from "../../config/intl_config";
export function getLocaleStaticParams() {
    return config.locales.map((locale) => ({ locale }));
}

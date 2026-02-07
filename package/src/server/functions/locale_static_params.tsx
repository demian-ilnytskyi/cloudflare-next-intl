import config from "../../config/intl_config";

export function getLocaleStaticParams(): { locale: string }[] {
  return config.locales.map((locale) => ({ locale }));
}
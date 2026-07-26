// NOTE: currently disabled — this file exports nothing at runtime, even
// though "./getLayoutStates" is listed in package.json's exports map.
// Do not rely on `cloudflare-next-intl/getLayoutStates` until this is
// re-enabled; use `getLocale()` + read the theme cookie manually instead.
// "use server";

// import { cookies } from "next/headers";
// import { localeCookieName, isDarkCookieKey } from "../config/cookie_key";
// import config from "../config/intl_config";

// interface HtmlParamProps {
//     className?: string;
//     suppressHydrationWarning?: boolean;
//     lang: string;
// }

// export default async function getLayoutStates(): Promise<{
//     isDark: boolean | null;
//     locale: string;
//     htmlParam?: HtmlParamProps;
// }> {
//     const cookie = await cookies();
//     const isDarkMode = cookie.get(isDarkCookieKey)?.value;
//     const isDark = getCookieBooleanValue(isDarkMode);
//     const cookieLocale = (cookie.get(localeCookieName)?.value as string) ?? config.defaultLocale;
//     const htmlParam: HtmlParamProps = { suppressHydrationWarning: !isDarkMode, lang: cookieLocale };
//     if (isDark === true) {
//         htmlParam.className = 'dark';
//     }
//     return { isDark, locale: cookieLocale, htmlParam };
// }

// function getCookieBooleanValue(cookieValue: string | undefined): boolean | null {
//     switch (cookieValue) {
//         case "true":
//             return true;
//         case "false":
//             return false;
//         default:
//             return null;
//     }
// }
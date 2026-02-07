// import { usePathname } from "@/l18n/navigation";
import { cn } from "@/lib/utils";
// import { useLocale } from "next-intl";
import { EnglishFlag, UkraineFlag } from "./flags";
import { getLocale, LocaleLink } from "cloudflare-next-intl";
import KTextConstants from "@/shared/constants/variables/text_constants";

/**
 * LanguageSwitcher component allows users to switch between Ukrainian and English languages.
 * It displays two flags, one for each language, and highlights the currently active language.
 * When a flag is clicked, it navigates to the same page with the selected locale.
 */
export default async function LanguageSwitcher(
    { className, englishSwitcherText, ukraineSwitcherText }: {
        className?: string;
        ukraineSwitcherText: string;
        englishSwitcherText: string;
    },
): Promise<Component> {
    const locale = await getLocale();
    const nextLocale: Language = locale === KTextConstants.defaultLocale
        ? "uk"
        : "en";
    const ariaLabelText = nextLocale === "uk"
        ? ukraineSwitcherText
        : englishSwitcherText;

    return (
        <LocaleLink
            locale={nextLocale} // Set the target locale for the link
            className={cn(
                "flex flex-row bg-blue-50 rounded-4xl group dark:bg-gray-400", // Styling for the switcher container
                className,
            )}
            aria-label={ariaLabelText}
        >
            <UkraineFlag isActive={nextLocale === "en"} />
            <EnglishFlag isActive={nextLocale === "uk"} />
        </LocaleLink>
    );
}

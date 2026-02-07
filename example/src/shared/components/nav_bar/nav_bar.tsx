import { cn } from "@/lib/utils";
import NavigationMobDialog from "./nav_mob_dialog";
import LanguageSwitcher from "../language_switcher/language_switcher";
import { getTranslations, Link, ThemeSwitcher } from "cloudflare-next-intl";

export default async function NavigationBar(): Promise<Component> {
    const t = await getTranslations("NavigationBar");

    function Buttons() {
        return (
            <>
                <_Button
                    path={`/test`}
                    text={t("test")}
                    prefetch={false}
                />
            </>
        );
    }
    const lightModeText = t("lightMode");
    const darkModeText = t("darkMode");
    const ukSwitchText = t("ukSwitcherLabel");
    const enSwitchText = t("enSwitcherLabel");

    return (
        <header className="sticky top-0 flex justify-center m-0 p-0 w-full z-10">
            <nav
                className={cn(
                    "bg-blue-100 max-h-18 w-full rounded-b-4xl",
                    "shadow-xl dark:bg-gray-700",
                    "overflow-hidden flex justify-between items-center px-3 py-4",
                )}
            >
                <Link
                    href={`/`}
                    className={cn(
                        "flex items-center p-2 hover:scale-110 hover:underline",
                        "duration-200 drop-shadow-md active:scale-90 cursor-pointer",
                    )}
                    aria-label={t("home")}
                    prefetch={false}
                >
                    {t("logo")}
                </Link>
                <div className="flex flex-row items-center not-small-mobile:w-full not-small-mobile:justify-evenly space-x-6 not-tablet:hidden">
                    <Buttons />
                </div>
                <div className="flex flex-row pr-3">
                    <ThemeSwitcher
                        className="hidden tablet:flex mr-3"
                        lightLabelText={lightModeText}
                        darkLabelText={darkModeText}
                    />
                    <LanguageSwitcher
                        className="hidden tablet:flex"
                        ukraineSwitcherText={ukSwitchText}
                        englishSwitcherText={enSwitchText}
                    />
                    <NavigationMobDialog ariaLabel={t("dialogLabel")}>
                        <Buttons />
                        <div className="flex flex-row gap-2 flex-wrap mt-2">
                            <LanguageSwitcher
                                className="mr-3"
                                ukraineSwitcherText={ukSwitchText}
                                englishSwitcherText={enSwitchText}
                            />
                            <ThemeSwitcher
                                lightLabelText={lightModeText}
                                darkLabelText={darkModeText}
                            />
                        </div>
                    </NavigationMobDialog>
                </div>
            </nav>
        </header>
    );
}

interface ButtonProps {
    text: string;
    path: string;
    prefetch: boolean;
}

function _Button(props: ButtonProps) {
    return (
        <Link
            href={props.path}
            className={cn(
                "flex items-center justify-center group text-base hover:scale-105 duration-200",
            )}
            prefetch={props.prefetch}
        >
            <div
                className={"h-full py-0 not-small-mobile:px-0 px-3 flex flex-row justify-center items-center"}
            >
                <div className="flex-col flex items-center ml-2 hover:underline">
                    <span>{props.text}</span>
                </div>
            </div>
        </Link>
    );
}

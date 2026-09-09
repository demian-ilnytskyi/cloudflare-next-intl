import type { Plugin } from "vite";
import { type LocaleParamsCheckMode } from "../locale_params_check/check_locale_params.js";
import type { PageLabelStyle } from "../dynamic_pages_check/derive_page_label.js";
export interface AutoLocaleParamsPluginOptions {
    appDir?: string;
    mode?: LocaleParamsCheckMode;
    localeParam?: string;
    skip?: readonly string[];
    overrides?: Readonly<Record<string, {
        localeParam?: string;
    }>>;
    runOnDev?: boolean;
    restoreAfterBuild?: boolean;
    verbose?: boolean | {
        pageLabel?: PageLabelStyle | ((file: string, appDir: string) => string);
    };
}
export declare function autoLocaleParamsPlugin(options?: AutoLocaleParamsPluginOptions): Plugin;

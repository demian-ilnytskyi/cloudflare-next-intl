import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';
export declare function setIntlConfig<const AppLocales extends Locales, const AppLocalePrefixMode extends LocalePrefixMode = 'as-needed'>(config: RoutingConfig<AppLocales, AppLocalePrefixMode>): RoutingConfig<AppLocales, AppLocalePrefixMode>;

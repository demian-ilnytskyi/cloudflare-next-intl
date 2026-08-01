
import intlConfig from '@intl-config';
import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types';

function getConfig(): RoutingConfig<Locales, LocalePrefixMode> {
    const value = intlConfig;

    if (value) {
        return intlConfig as RoutingConfig<Locales, LocalePrefixMode>;
    } else {
        throw Error(
            'cloudflare-next-intl: the `@intl-config` alias is not set. ' +
            'Create a config file (e.g. `src/i18n/intl_config.ts`) that default-exports ' +
            'your `RoutingConfig` (see `setIntlConfig`), then point `@intl-config` at it via ' +
            'your bundler/tsconfig path alias — see the README "Setup" section, step 2.',
        );
    }
}

const config = getConfig();

export default config;
import intlConfig from '@intl-config';
import type { LocalePrefixMode, Locales, RoutingConfig } from '../types/types.js';

function getConfig(): RoutingConfig<Locales, LocalePrefixMode> {
    const value = intlConfig;
    if (value) {
        return intlConfig as RoutingConfig<Locales, LocalePrefixMode>;
    }
    throw Error(
        'cloudflare-next-intl: the `@intl-config` alias is not set. ' +
        'Create a config file (e.g. `src/i18n/intl_config.ts`) that default-exports ' +
        'your `RoutingConfig` (see `setIntlConfig`), then point `@intl-config` at it via ' +
        'your bundler/tsconfig path alias — see the README "Setup" section, step 2.',
    );
}

const config = new Proxy({} as RoutingConfig<Locales, LocalePrefixMode>, {
    get(target, prop) {
        if (prop === 'then' || prop === 'default' || typeof prop === 'symbol') {
            return Reflect.get(target, prop);
        }
        return (getConfig() as unknown as Record<string | symbol, unknown>)[prop];
    },
});

export default config;

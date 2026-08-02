import intlConfig from '@intl-config';
function getConfig() {
    const value = intlConfig;
    if (value) {
        return intlConfig;
    }
    else {
        throw Error('cloudflare-next-intl: the `@intl-config` alias is not set. ' +
            'Create a config file (e.g. `src/i18n/intl_config.ts`) that default-exports ' +
            'your `RoutingConfig` (see `setIntlConfig`), then point `@intl-config` at it via ' +
            'your bundler/tsconfig path alias — see the README "Setup" section, step 2.');
    }
}
const config = getConfig();
export default config;
